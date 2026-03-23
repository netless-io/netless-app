// this controller does these things:
// 1. map slide events to ui
// 2. make sure to init correctly
//    - the one with (context.isAddApp === true) should call renderSlide(1)
//    - others wait for first sync event and restore from sync state
//    - if none of above happen, force doing renderSlide(1) after timeout
// 3. send/receive slide sync events
// 4. automatically re-create scenes to sync strokes, a view must be existing
// 5. pages information are loaded dynamically by the slide package

import type { AppContext, Player, Room, Displayer } from "@netless/window-manager";
import type { ISlideConfig, SyncEvent } from "@netless/slide";
import type { Attributes, MagixEvents, MagixPayload, SlideState } from "../typings";
import type { AppOptions } from "..";

import { SideEffectManager } from "side-effect-manager";
import { Slide, SLIDE_EVENTS } from "@netless/slide";
import { clamp } from "../utils/helpers";
import { cachedGetBgColor } from "../utils/bgcolor";
import { log, verbose, setRoomLogger } from "../utils/logger";
import { getRoomTracker } from "../utils/tracker";
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
    setRoomLogger((this.room || this.player) as Displayer);
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
          this.ready = true;
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
    }
    // there's still some risk that the adder is left and no first render
    // so anyway, we start polling the slide's "ready state"
    // if in the next 20 seconds the slide is not ready, start render first page
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
      if (this._toFreeze === 1) {
        this.freeze();
      } else if (this._toFreeze === -1) {
        this.unfreeze();
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
    const options = this.context.getAppOptions() || {};
    const attribute = this.context.storage.state;
    const slide = new Slide({
      anchor,
      interactive: true,
      mode: "interactive",
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
      logger: options.logger,
      whiteTracker: defaults.whiteTracker,
      timestamp: this.timestamp,
      customLinks: attribute.customLinks,
      skipActionWhenFrozen: options.skipActionWhenFrozen ?? true,
      resourceMaxRetries: options.resourceMaxRetries,
      onResourceMaxRetries: options.onResourceMaxRetries,
    });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).slide = slide;
    }
    return slide;
  }

  protected destroyed = false;

  public destroy() {
    this.sideEffect.flushAll();
    if (!this.destroyed) {
      log("[Slide] destroy slide (once)");
      this.slide.destroy();
      this.destroyed = true;
    }
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
  protected _toFreeze: -1 | 0 | 1 = 0; // -1: unfreeze, 0: no change, 1: freeze

  public freeze = () => {
    this.isFrozen = true;
    if (this.ready) {
      log("[Slide] freeze", this.context.appId);
      if (this.invisibleBehavior === "frozen") {
        this.slide.frozen();
      } else {
        this.slide.pause();
      }
    } else {
      this._toFreeze = 1;
    }
  };

  public unfreeze = async () => {
    if (!this.visible) return;
    this.isFrozen = false;
    if (this.ready) {
      let isNeedSyncState = false;
      log("[Slide] unfreeze", this.context.appId);
      if (this.invisibleBehavior === "frozen") {
        this.slide.release();
        isNeedSyncState = true;
      } else {
        this.slide.resume();
      }
      if (isNeedSyncState) {
        const state = this.context.storage.state.state;
        if (state) {
          log("[Slide] sync storage", JSON.stringify(state));
          this.slide.setSlideState(state);
        }
      }
    } else {
      this._toFreeze = -1;
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
    if (state === "minimized") {
      log("[Slide] freeze because app state is minimized");
      this.freeze();
    }
  };

  protected onAppStatusChangeHandler = (payload: {
    appId: string;
    status: "normal" | "minimized" | "maximized";
  }) => {
    const { appId, status } = payload;
    if (appId === this.context.appId && status === "minimized") {
      log("[Slide] freeze because app status is minimized");
      this.freeze();
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

  protected onVisibilityChange = async () => {
    const appStatus = this.getAppStatus();
    if (appStatus === "minimized") {
      log("[Slide] do nothing because app state is minimized");
      return;
    }
    if (!(this.visible = document.visibilityState === "visible")) {
      this.savedIsFrozen = this.isFrozen;
      log("[Slide] freeze because tab becomes invisible");
      this.freeze();
    } else {
      if (!this.savedIsFrozen) {
        log("[Slide] unfreeze because tab becomes visible", { savedIsFrozen: this.savedIsFrozen });
        this.unfreeze();
      }
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
