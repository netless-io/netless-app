// this controller does these things:
// 1. map slide events to ui
// 2. make sure to init correctly
//    - the one with (context.isAddApp === true) should call renderSlide(1)
//    - others restore from sync state, or render page 1 locally if no state exists
// 3. send/receive slide sync events
// 4. automatically re-create scenes to sync strokes, a view must be existing
// 5. pages information are loaded dynamically by the slide package

import type { AppContext, Player, Room } from "@netless/window-manager";
import type { ISlideConfig, SyncEvent } from "@netless/slide";
import type { Attributes, MagixEvents, MagixPayload, SlideState } from "../typings";
import type { AppOptions } from "..";

import { SideEffectManager } from "side-effect-manager";
import { Slide, SLIDE_EVENTS } from "@netless/slide";
import { clamp } from "../utils/helpers";
import { cachedGetBgColor } from "../utils/bgcolor";
import { log, verbose, setRoomLogger, logger } from "../utils/logger";
import { getRoomTracker } from "../utils/tracker";
import { createFocusTransitionQueue, shouldSlideRuntimeBeActive } from "../utils/focus-transition";
export { syncSceneWithSlide, createDocsViewerPages } from "./helpers";

export const DefaultUrl = "https://convertcdn.netless.link/dynamicConvert";
export const MaxPollCount = 40; // 500ms * 40 times = 20s
export const EmptyAttributes: Attributes = {
  taskId: "",
  url: "",
  state: null,
  resourceList: [],
  previewList: [],
  customLinks: [],
  slideScale: 1,
  translateX: 0.5,
  translateY: 0.5,
  originSize: null,
};

export interface SlideControllerOptions {
  context: AppContext<Attributes, MagixEvents, AppOptions>;
  anchor: HTMLDivElement;
  onRenderStart: () => void;
  onRenderEnd: () => void;
  onPageChanged: (page: number) => void;
  onTransitionStart: () => void;
  onTransitionEnd: () => void;
  onError: (args: { error: Error; index: number }) => void;
  onRenderError?: (error: Error, pageIndex: number) => void;
  onNavigate?: (index: number, origin?: string) => void;
  showRenderError?: boolean;
  invisibleBehavior?: "frozen" | "pause";
}

const noop = function noop() {
  // do nothing
};

type SlideWebGLTask = {
  label: string;
  run: () => void | Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

const slideWebGLTasks: SlideWebGLTask[] = [];
let slideWebGLRunning = false;

function runNextSlideWebGLTask(): void {
  if (slideWebGLRunning) return;
  const task = slideWebGLTasks.shift();
  if (!task) return;
  slideWebGLRunning = true;
  const startedAt = performance.now();
  log("[Slide][player-queue] start", task.label, "pending", slideWebGLTasks.length);
  void Promise.resolve()
    .then(task.run)
    .then(
      () => {
        log(
          "[Slide][player-queue] done",
          task.label,
          "ms",
          Math.round(performance.now() - startedAt)
        );
        task.resolve();
      },
      error => {
        log("[Slide][player-queue] failed", task.label, error);
        task.reject(error);
      }
    )
    .finally(() => {
      slideWebGLRunning = false;
      runNextSlideWebGLTask();
    });
}

export function enqueueSlideWebGLTransition(
  run: () => void | Promise<void>,
  priority = false,
  label = "unspecified"
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const task = { label, run, resolve, reject };
    if (priority) slideWebGLTasks.unshift(task);
    else slideWebGLTasks.push(task);
    runNextSlideWebGLTask();
  });
}

type MagixEventListener = Parameters<
  AppContext<Attributes, MagixEvents>["addMagixEventListener"]
>[1];

export class SlideControllerBase {
  public readonly context: SlideControllerOptions["context"];
  public slide!: Slide;
  public readonly showRenderError: boolean;
  public readonly onRenderError?: (error: Error, pageIndex: number) => void;
  public readonly onNavigate!: (index: number, origin?: string) => void;

  protected readonly room?: Room;
  protected readonly player?: Player;
  protected readonly sideEffect = new SideEffectManager();

  protected readonly onRenderStart: SlideControllerOptions["onRenderStart"];
  protected readonly onPageChanged: SlideControllerOptions["onPageChanged"];
  protected readonly onTransitionStart: SlideControllerOptions["onTransitionStart"];
  protected readonly onTransitionEnd: SlideControllerOptions["onTransitionEnd"];
  protected readonly onError: SlideControllerOptions["onError"];

  protected syncStateOnceFlag: boolean;

  protected visible: boolean;
  protected savedIsFrozen: boolean;
  protected focused = true;

  protected invisibleBehavior: "frozen" | "pause";

  // 签名后的预览图
  public previewList: string[] = [];

  public constructor(props: SlideControllerOptions) {
    const {
      context,
      onRenderStart,
      onPageChanged,
      onTransitionStart,
      onTransitionEnd,
      onNavigate,
      onError,
      onRenderError,
      showRenderError,
      invisibleBehavior,
    } = props;
    this.invisibleBehavior = invisibleBehavior ?? "frozen";
    this.onRenderStart = onRenderStart;
    this.onPageChanged = onPageChanged;
    this.onTransitionStart = onTransitionStart;
    this.onTransitionEnd = onTransitionEnd;
    this.onNavigate = onNavigate || noop;
    this.onError = onError;
    this.onRenderError = onRenderError;
    this.showRenderError = showRenderError ?? true;

    this.context = context;
    this.room = context.getRoom();
    this.player = this.room ? undefined : (context.getDisplayer() as Player);
    setRoomLogger(context);
    // this.slide = this.createSlide(anchor, {
    //   whiteTracker: getRoomTracker(context.getDisplayer()),
    // });

    // the adder does not need to sync state
    this.syncStateOnceFlag = !this.context.isAddApp;
    this.visible = document.visibilityState === "visible";
    this.savedIsFrozen = false;
    // this.initialize();
  }

  public ready = false;
  protected resolveReady!: (index: number) => void;
  public readonly readyPromise = new Promise<void>(resolve => {
    this.resolveReady = slideIndex => {
      if (this.ready) {
        log("[Slide] render end", slideIndex);
      } else {
        setTimeout(() => {
          if (this.destroyed) return;
          this.ready = true;
          if (this.isLazySetupMode()) void this.reconcileActivity(true).catch(() => undefined);
          resolve();
        }, 1000);
      }
    };
  });

  // origin = why it happens
  // - undefined: via fastboard dispatchDocsEvent()
  // - input: via bottom-right page number input box
  // - preview: via the left preview menu's item
  // - navigation: via the footer's back/next button
  // - keydown: via global arrow left/right keydown
  public jumpToPage(page: number, origin?: string) {
    if (this.ready) {
      page = clamp(page, 1, this.pageCount);
      this.onNavigate(page, origin);
      this.slide.renderSlide(page);
    }
  }

  protected initialize() {
    this.registerEventListeners();
    this.kickStart();
  }

  protected kickStart() {
    const { context, slide } = this;
    if (context.getIsWritable()) {
      context.storage.ensureState(EmptyAttributes);
    }
    const { taskId, url, resourceList, previewList, state } = context.storage.state;
    this.previewList = previewList;
    if (resourceList && resourceList.length > 0) {
      slide.setResourceList(taskId, resourceList);
    } else {
      slide.setResource(taskId, url || DefaultUrl);
    }
    if (state) {
      // if we already have state, try restore from it
      log("[Slide] init with state", JSON.stringify(state));
      this.syncStateOnceFlag = false;
      slide.setSlideState(state);
    } else if (context.isAddApp) {
      // otherwise, maybe this slide is just added, let the adder kick start first render
      log("[Slide] init by renderSlide", 1);
      slide.renderSlide(1);
    } else if (taskId) {
      // A previous add may have persisted the App before its first render.
      // Render locally so a restored or read-only client can recover it.
      void slide.doRenderSlide(1).catch(error => {
        logger.error("[Slide] initial local render failed", context.appId, error);
      });
    }
    // Keep tracking the first render for setup diagnostics.
    this.pollReadyState();
  }

  protected registerEventListeners() {
    const { context, slide } = this;

    // it is possible that we miss the first `renderSlide(1)` event
    // and the attributes has no value yet, so we need to sync state
    // when there's state change. we only have to do it once
    const disposerId = this.sideEffect.addDisposer(
      context.storage.addStateChangedListener(() => {
        if (context.storage.state.state) {
          this.syncStateOnce();
          this.sideEffect.flush(disposerId);
        }
      })
    );

    this.sideEffect.add(() =>
      context.addMagixEventListener(SLIDE_EVENTS.syncDispatch, this.magixEventListener, {
        fireSelfEventAfterCommit: true,
      })
    );

    slide.on(SLIDE_EVENTS.renderStart, this.onRenderStart);
    slide.on(SLIDE_EVENTS.slideChange, this.onPageChanged);
    slide.on(SLIDE_EVENTS.renderEnd, this.onTransitionEnd);
    slide.on(SLIDE_EVENTS.mainSeqStepStart, this.onTransitionStart);
    slide.on(SLIDE_EVENTS.mainSeqStepEnd, this.onTransitionEnd);
    slide.on(SLIDE_EVENTS.renderError, this.onError);
    slide.on(SLIDE_EVENTS.stateChange, this.onStateChange);
    slide.on(SLIDE_EVENTS.syncDispatch, this.onSyncDispatch);

    slide.on(SLIDE_EVENTS.renderEnd, this.resolveReady);

    this.sideEffect.add(() => {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      this.bindAppStateChangeEvent();
      return () => {
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
        try {
          this.context.emitter.off("boxStatusChange", this.onAppStatusChangeHandler);
          this.context
            .getWindowManager()
            .emitter.off("boxStateChange", this.onAppStateChangeHandler);
        } catch (error) {
          log(
            "[Slide] unbind app state change event failed, because should update window manager to latest version"
          );
        }
      };
    });
  }

  protected onSyncDispatch = (event: SyncEvent) => {
    if (this.context.getIsWritable() && this.room) {
      const payload: MagixPayload = {
        type: SLIDE_EVENTS.syncDispatch,
        payload: event,
      };
      verbose("[Slide] dispatch", JSON.stringify(event));
      this.context.dispatchMagixEvent(SLIDE_EVENTS.syncDispatch, payload);
    }
  };

  protected magixEventListener: MagixEventListener = ev => {
    const { type, payload } = ev.payload;
    if (type === SLIDE_EVENTS.syncDispatch) {
      this.syncStateOnce();
      verbose("[Slide] receive", JSON.stringify(payload));
      this.slide.emit(SLIDE_EVENTS.syncReceive, payload);
    }
  };

  protected syncStateOnce() {
    // sync state before the first event, so that they can be in the correct order
    if (this.syncStateOnceFlag) {
      if (this.context.getIsWritable()) {
        this.context.storage.ensureState(EmptyAttributes);
      }
      const { state } = this.context.storage.state;
      if (state) {
        log("[Slide] sync with state (once)", JSON.stringify(state));
        this.slide.setSlideState(state);
        this.syncStateOnceFlag = false;
      }
    }
  }

  protected onStateChange = (state: SlideState) => {
    if (this.context.getIsWritable()) {
      verbose("[Slide] state change", JSON.stringify(state, null, 2));
      this.context.storage.setState({ state });
    }
  };

  protected pollCount = 0;
  protected pollReadyState = () => {
    if (this.ready) {
      if (this.isLazySetupMode()) {
        void this.reconcileActivity().catch(() => undefined);
        return;
      }
      if (this._toFreeze === 1) {
        void this.freeze().catch(error =>
          logger.error("[Slide] deferred freeze failed", this.context.appId, error)
        );
      } else if (this._toFreeze === -1) {
        void this.unfreeze().catch(error =>
          logger.error("[Slide] deferred unfreeze failed", this.context.appId, error)
        );
      }
    } else if (this.pollCount < MaxPollCount) {
      this.pollCount++;
      setTimeout(this.pollReadyState, 500);
    } else {
      this.pollCount = 0;
      log("[Slide] init timeout");
    }
  };

  // cache `slideCount`, because once the slide is frozen,
  // the `slideCount` will be 0
  protected _pageCount = 0;
  public get pageCount() {
    if (this._pageCount > 0) return this._pageCount;
    this._pageCount = this.slide.slideCount;
    return this._pageCount;
  }

  public get page() {
    return this.slide.slideState.currentSlideIndex;
  }

  protected createSlide(anchor: HTMLDivElement, defaults: Partial<ISlideConfig> = {}) {
    const options = (this.context.getAppOptions() || {}) as AppOptions;
    const attribute = this.context.storage.state;
    const slide = new Slide({
      anchor,
      interactive: true,
      mode: "interactive",
      syncEventQueuePolicy: options.syncEventQueuePolicy ?? "fifo",
      controller: false,
      enableGlobalClick: options.enableGlobalClick ?? true,
      renderOptions: {
        minFPS: options.minFPS || 25,
        maxFPS: options.maxFPS || 30,
        autoFPS: options.autoFPS ?? true,
        autoResolution: options.autoResolution ?? true,
        resolution: options.resolution,
        transactionBgColor: options.bgColor || cachedGetBgColor(anchor),
        maxResolutionLevel: options.maxResolutionLevel,
        forceCanvas: options.forceCanvas,
        enableNvidiaDetect: options.enableNvidiaDetect,
      },
      fixedFrameSize: options.fixedFrameSize,
      loaderDelegate: options.loaderDelegate,
      navigatorDelegate: options.navigatorDelegate,
      urlInterrupter: options.urlInterrupter,
      resourceTimeout: options.resourceTimeout,
      rtcAudio: options.rtcAudio,
      useLocalCache: options.useLocalCache,
      logger: {
        ...options.logger,
        error: (message, ...details) => {
          logger.error(message, ...details);
          if (options.logger !== logger.roomLogger) {
            try {
              options.logger?.error?.(message, ...details);
            } catch {
              // Keep the App error even if a custom logger fails.
            }
          }
        },
        warn: (message, ...details) => {
          logger.warn(message, ...details);
          if (options.logger !== logger.roomLogger) {
            try {
              options.logger?.warn?.(message, ...details);
            } catch {
              // Keep the App warning even if a custom logger fails.
            }
          }
        },
      },
      whiteTracker: defaults.whiteTracker,
      timestamp: this.timestamp,
      customLinks: attribute.customLinks,
      skipActionWhenFrozen: options.skipActionWhenFrozen ?? true,
      resourceMaxRetries: options.resourceMaxRetries,
      onResourceMaxRetries: options.onResourceMaxRetries,
      // Slide 内部 ResizeObserver 关掉，改由 app-slide 的 observer + boxSizeChange 一起驱动
      disableFrameResizeObserver: true,
    });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).slide = slide;
    }
    return slide;
  }

  protected destroyed = false;
  protected destroyPromise?: Promise<void>;
  private resolveDestroyedSignal!: () => void;
  private readonly destroyedSignal = new Promise<void>(resolve => {
    this.resolveDestroyedSignal = resolve;
  });

  public destroy(): Promise<void> {
    this.sideEffect.flushAll();
    if (!this.destroyed) {
      log("[Slide] destroy slide (once)");
      this.destroyed = true;
      this.destroyPromise = enqueueSlideWebGLTransition(
        () =>
          new Promise<void>((resolve, reject) => {
            try {
              (
                this.slide.destroy as (
                  onPlayerDestroyed?: () => void,
                  onError?: (error: unknown) => void
                ) => void
              ).call(
                this.slide,
                () => {
                  resolve();
                },
                reject
              );
            } catch (error) {
              reject(error);
            }
          }),
        true,
        `destroy:${this.context.appId}`
      );
      this.resolveDestroyedSignal();
    }
    return this.destroyPromise ?? Promise.resolve();
  }

  public timestamp = () => {
    if (this.room && this.room.calibrationTimestamp) {
      return this.room.calibrationTimestamp;
    } else if (this.player) {
      return this.player.beginTimestamp + this.player.progressTime;
    } else {
      return Date.now();
    }
  };

  public isFrozen = false;
  private resourceStateUnknown = false;
  private managedActivity = false;
  protected _toFreeze: -1 | 0 | 1 = 0; // -1: unfreeze, 0: no change, 1: freeze

  public setFocusedState = (focused: boolean): Promise<void> => {
    this.focused = focused;
    return this.reconcileActivity();
  };

  private resourceTransition = createFocusTransitionQueue(
    undefined,
    async active => {
      if (this.destroyed) return;
      // A queued release can become stale before the engine starts it.
      if (active && this.shouldBeActive()) await this.unfreeze();
      else await this.freeze();
    },
    error => logger.error("[Slide] resource transition failed", this.context.appId, error)
  );

  private shouldBeActive = (): boolean => {
    const wm = this.context.getWindowManager() as any;
    const host = (this.context as any).getRuntimeActivity?.();
    const lazy = this.isLazySetupMode();
    // New hosts own one activity snapshot. Mixing it with the delayed UI
    // boxState can acknowledge "frozen" while the host expects activation.
    // Old hosts retain the original local/Attribute checks.
    const minimized =
      lazy && host
        ? !host.active
        : wm?.boxState === "minimized" ||
          wm?.attributes?.minimized === true ||
          this.context.getBoxStatus() === "minimized";
    return (
      shouldSlideRuntimeBeActive(
        !lazy || this.focused,
        document.visibilityState !== "hidden",
        minimized
      ) &&
      (!lazy || host?.active !== false)
    );
  };

  public reconcileActivity = (force = false): Promise<void> => {
    if (this.destroyed) return Promise.resolve();
    if (this.isLazySetupMode()) this.managedActivity = true;
    if (!this.managedActivity) return Promise.resolve();
    this.visible = document.visibilityState !== "hidden";
    return this.resourceTransition(this.shouldBeActive(), force);
  };

  public freeze = async (): Promise<void> => {
    const previousIsFrozen = this.isFrozen;
    const previousToFreeze = this._toFreeze;
    this.isFrozen = true;
    try {
      if (this.ready) {
        log("[Slide] freeze", this.context.appId);
        if (this.invisibleBehavior === "frozen") {
          await enqueueSlideWebGLTransition(
            () => {
              if (this.destroyed) return Promise.resolve();
              const destroyed = new Promise<void>((resolve, reject) => {
                const result = (
                  this.slide.frozen as (
                    onPlayerDestroyed?: () => void,
                    onError?: (error: unknown) => void
                  ) => void | Promise<void>
                ).call(
                  this.slide,
                  () => {
                    resolve();
                  },
                  reject
                );
                if (result) void result.then(resolve, reject);
              });
              return Promise.race([destroyed, this.destroyedSignal]);
            },
            false,
            `freeze:${this.context.appId}`
          );
        } else {
          this.slide.pause();
        }
      } else {
        this._toFreeze = 1;
      }
      this.resourceStateUnknown = false;
    } catch (error) {
      this.resourceStateUnknown = true;
      this.isFrozen = previousIsFrozen;
      this._toFreeze = previousToFreeze;
      throw error;
    }
  };

  public unfreeze = async (): Promise<void> => {
    if (!this.visible) return;
    if (!this.isFrozen && this.ready && !this.resourceStateUnknown) return;
    const previousIsFrozen = this.isFrozen;
    const previousToFreeze = this._toFreeze;
    this.isFrozen = false;
    try {
      if (this.ready) {
        log("[Slide] unfreeze", this.context.appId);
        if (this.invisibleBehavior === "frozen") {
          await enqueueSlideWebGLTransition(
            () => {
              if (this.destroyed) return Promise.resolve();
              const created = new Promise<void>((resolve, reject) => {
                const result = (
                  this.slide.release as (
                    onRestored?: () => void,
                    onPlayerCreated?: () => void,
                    onError?: (error: unknown) => void
                  ) => void | Promise<void>
                ).call(
                  this.slide,
                  () => {
                    if (this.isLazySetupMode() && !this.shouldBeActive()) return;
                    this.slide.notifyFrameResize();
                    const state = this.context.storage.state.state;
                    if (state) {
                      log("[Slide] sync storage", JSON.stringify(state));
                      void this.slide.setSlideState(state).catch(error => {
                        this.resourceStateUnknown = true;
                        logger.error(
                          "[Slide] storage sync after release failed",
                          this.context.appId,
                          error
                        );
                      });
                    }
                  },
                  () => {
                    resolve();
                  },
                  reject
                );
                if (result) void result.then(resolve, reject);
              });
              return Promise.race([created, this.destroyedSignal]);
            },
            false,
            `release:${this.context.appId}`
          );
        } else {
          this.slide.resume();
          this.slide.notifyFrameResize();
        }
      } else {
        this._toFreeze = -1;
      }
      this.resourceStateUnknown = false;
    } catch (error) {
      this.resourceStateUnknown = true;
      this.isFrozen = previousIsFrozen;
      this._toFreeze = previousToFreeze;
      throw error;
    }
  };

  protected bindAppStateChangeEvent = () => {
    try {
      const boxStatus = this.context.getBoxStatus();
      if (boxStatus) {
        const appProxy = this.context.getAppProxy();
        if (appProxy) {
          this.context.emitter.on("boxStatusChange", this.onAppStatusChangeHandler);
        }
      } else {
        const windowManager = this.context.getWindowManager();
        if (windowManager) {
          windowManager.emitter.on("boxStateChange", this.onAppStateChangeHandler);
        }
      }
    } catch (error) {
      log(
        "[Slide] bind app state change event failed, because should update window manager to latest version"
      );
    }
  };

  protected onAppStateChangeHandler = (state: "normal" | "minimized" | "maximized") => {
    if (this.isLazySetupMode() || this.managedActivity) {
      void this.reconcileActivity().catch(() => undefined);
      return;
    }
    if (state === "minimized") {
      log("[Slide] freeze because app state is minimized");
      void this.freeze().catch(error =>
        logger.error("[Slide] minimized freeze failed", this.context.appId, error)
      );
    }
  };

  protected onAppStatusChangeHandler = (payload: {
    appId: string;
    status: "normal" | "minimized" | "maximized";
  }) => {
    const { appId, status } = payload;
    if (appId === this.context.appId && (this.isLazySetupMode() || this.managedActivity)) {
      void this.reconcileActivity().catch(() => undefined);
      return;
    }
    if (appId === this.context.appId && status === "minimized") {
      log("[Slide] freeze because app status is minimized");
      void this.freeze().catch(error =>
        logger.error("[Slide] minimized freeze failed", this.context.appId, error)
      );
    }
  };

  protected getAppStatus = (): "normal" | "minimized" | "maximized" | undefined => {
    try {
      const boxStatus = this.context.getBoxStatus();
      // 如果boxStatus存在, 则使用boxStatus(单独窗口状态)
      if (boxStatus) {
        return boxStatus;
      }
      // 如果boxStatus不存在，则检查boxState是否存在(所有窗口统一状态)
      const windowManager = this.context.getWindowManager();
      const boxstate = windowManager.boxState;
      return boxstate;
    } catch (error) {
      return undefined;
    }
  };

  protected isLazySetupMode = (): boolean => {
    try {
      return (this.context.getWindowManager() as any)?.lazySetupInMaximizedMode === true;
    } catch {
      return false;
    }
  };

  protected onVisibilityChange = async () => {
    try {
      this.visible = document.visibilityState === "visible";
      if (this.isLazySetupMode() || this.managedActivity) {
        await this.reconcileActivity().catch(() => undefined);
        return;
      }
      const appStatus = this.getAppStatus();
      if (!this.visible) {
        this.savedIsFrozen = this.isFrozen;
        log("[Slide] freeze because tab becomes invisible");
        if (!this.isFrozen) await this.freeze();
        return;
      }

      if (appStatus === "minimized") {
        log("[Slide] do nothing because app state is minimized");
        return;
      }
      if (!this.savedIsFrozen) {
        log("[Slide] unfreeze because tab becomes visible", { savedIsFrozen: this.savedIsFrozen });
        await this.unfreeze();
      }
    } catch (error) {
      logger.error("[Slide] visibility transition failed", this.context.appId, error);
    }
  };
}

export class SlideController extends SlideControllerBase {
  public constructor(props: SlideControllerOptions) {
    super(props);
    this.slide = this.createSlide(props.anchor, {
      whiteTracker: getRoomTracker(props.context.getDisplayer()),
    });
    this.initialize();
  }
}
