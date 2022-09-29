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
import type { SyncEvent } from "@netless/slide";
import type { Attributes, MagixEvents, MagixPayload, SlideState } from "../typings";
import type { AppOptions } from "..";

import { SideEffectManager } from "side-effect-manager";
import { Slide, SLIDE_EVENTS } from "@netless/slide";
import { clamp } from "../utils/helpers";
import { cachedGetBgColor } from "../utils/bgcolor";
import { logger, log, verbose, setRoomLogger } from "../utils/logger";
export { syncSceneWithSlide, createDocsViewerPages } from "./helpers";

export const DefaultUrl = "https://convertcdn.netless.link/dynamicConvert";
export const MaxPollCount = 40; // 500ms * 40 times = 20s
export const EmptyAttributes: Attributes = {
  taskId: "",
  url: "",
  state: null,
  preview: true,
};

export interface SlideControllerOptions {
  context: AppContext<Attributes, MagixEvents, AppOptions>;
  anchor: HTMLDivElement;
  onRenderEnd: () => void;
  onPageChanged: (page: number) => void;
  onTransitionStart: () => void;
  onTransitionEnd: () => void;
  onError: (args: { error: Error }) => void;
}

type MagixEventListener = Parameters<
  AppContext<Attributes, MagixEvents>["addMagixEventListener"]
>[1];

export class SlideController {
  public readonly context: SlideControllerOptions["context"];
  public readonly slide: Slide;

  private readonly room?: Room;
  private readonly player?: Player;
  private readonly sideEffect = new SideEffectManager();

  private readonly onPageChanged: SlideControllerOptions["onPageChanged"];
  private readonly onTransitionStart: SlideControllerOptions["onTransitionStart"];
  private readonly onTransitionEnd: SlideControllerOptions["onTransitionEnd"];
  private readonly onError: SlideControllerOptions["onError"];

  private syncStateOnceFlag: boolean;

  private visible: boolean;
  private savedIsFrozen: boolean;

  public constructor({
    context,
    anchor,
    onPageChanged,
    onTransitionStart,
    onTransitionEnd,
    onError,
  }: SlideControllerOptions) {
    this.onPageChanged = onPageChanged;
    this.onTransitionStart = onTransitionStart;
    this.onTransitionEnd = onTransitionEnd;
    this.onError = onError;

    this.context = context;
    this.room = context.getRoom();
    this.player = this.room ? undefined : (context.getDisplayer() as Player);
    setRoomLogger((this.room || this.player) as Displayer);
    this.slide = this.createSlide(anchor);

    // the adder does not need to sync state
    this.syncStateOnceFlag = !this.context.isAddApp;
    this.visible = document.visibilityState === "visible";
    this.savedIsFrozen = false;
    this.initialize();
  }

  public ready = false;
  private resolveReady!: () => void;
  public readonly readyPromise = new Promise<void>(resolve => {
    this.resolveReady = () => {
      if (this.ready) {
        log("[Slide] render end");
      } else {
        setTimeout(() => {
          this.ready = true;
          resolve();
        }, 1000);
      }
    };
  });

  public jumpToPage(page: number) {
    if (this.ready) {
      page = clamp(page, 1, this.pageCount);
      this.slide.renderSlide(page);
    }
  }

  private initialize() {
    this.registerEventListeners();
    this.kickStart();
  }

  private kickStart() {
    const { context, slide } = this;
    if (context.getIsWritable()) {
      context.storage.ensureState(EmptyAttributes);
    }
    const { taskId, url, state } = context.storage.state;
    slide.setResource(taskId, url || DefaultUrl);
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

  private registerEventListeners() {
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

    slide.on(SLIDE_EVENTS.slideChange, this.onPageChanged);
    slide.on(SLIDE_EVENTS.renderStart, this.onTransitionStart);
    slide.on(SLIDE_EVENTS.renderEnd, this.onTransitionEnd);
    slide.on(SLIDE_EVENTS.mainSeqStepStart, this.onTransitionStart);
    slide.on(SLIDE_EVENTS.mainSeqStepEnd, this.onTransitionEnd);
    slide.on(SLIDE_EVENTS.renderError, this.onError);
    slide.on(SLIDE_EVENTS.stateChange, this.onStateChange);
    slide.on(SLIDE_EVENTS.syncDispatch, this.onSyncDispatch);

    slide.on(SLIDE_EVENTS.renderEnd, this.resolveReady);

    this.sideEffect.add(() => {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      return () => document.removeEventListener("visibilitychange", this.onVisibilityChange);
    });
  }

  private onSyncDispatch = (event: SyncEvent) => {
    if (this.context.getIsWritable() && this.room) {
      const payload: MagixPayload = {
        type: SLIDE_EVENTS.syncDispatch,
        payload: event,
      };
      verbose("[Slide] dispatch", JSON.stringify(event));
      this.context.dispatchMagixEvent(SLIDE_EVENTS.syncDispatch, payload);
    }
  };

  private magixEventListener: MagixEventListener = ev => {
    const { type, payload } = ev.payload;
    if (type === SLIDE_EVENTS.syncDispatch) {
      this.syncStateOnce();
      verbose("[Slide] receive", JSON.stringify(payload));
      this.slide.emit(SLIDE_EVENTS.syncReceive, payload);
    }
  };

  private syncStateOnce() {
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

  private onStateChange = (state: SlideState) => {
    if (this.context.getIsWritable()) {
      verbose("[Slide] state change", JSON.stringify(state, null, 2));
      this.context.storage.setState({ state });
    }
  };

  private pollCount = 0;
  private pollReadyState = () => {
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
      log("[Slide] renderSlide 1 (retry after timeout)");
      this.slide.renderSlide(1);
    }
  };

  // cache `slideCount`, because once the slide is frozen,
  // the `slideCount` will be 0
  private _pageCount = 0;
  public get pageCount() {
    if (this._pageCount > 0) return this._pageCount;
    this._pageCount = this.slide.slideCount;
    return this._pageCount;
  }

  public get page() {
    return this.slide.slideState.currentSlideIndex;
  }

  private createSlide(anchor: HTMLDivElement) {
    const options = this.context.getAppOptions() || {};
    const slide = new Slide({
      anchor,
      interactive: true,
      mode: "interactive",
      controller: logger.enable,
      enableGlobalClick: true,
      renderOptions: {
        minFPS: options.minFPS || 25,
        maxFPS: options.maxFPS || 30,
        autoFPS: options.autoFPS ?? true,
        autoResolution: options.autoResolution ?? true,
        resolution: options.resolution,
        transactionBgColor: options.bgColor || cachedGetBgColor(anchor),
        maxResolutionLevel: options.maxResolutionLevel,
      },
      fixedFrameSize: options.fixedFrameSize,
      loaderDelegate: options.loaderDelegate,
      navigatorDelegate: options.navigatorDelegate,
      resourceTimeout: options.resourceTimeout,
      rtcAudio: options.rtcAudio,
      useLocalCache: options.useLocalCache,
      logger: options.logger,
      timestamp: this.timestamp,
    });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).slide = slide;
    }
    return slide;
  }

  private destroyed = false;

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
  private _toFreeze: -1 | 0 | 1 = 0; // -1: unfreeze, 0: no change, 1: freeze

  public freeze = () => {
    this.isFrozen = true;
    if (this.ready) {
      log("[Slide] freeze", this.context.appId);
      this.slide.frozen();
    } else {
      this._toFreeze = 1;
    }
  };

  public unfreeze = async () => {
    if (!this.visible) return;
    this.isFrozen = false;
    if (this.ready) {
      log("[Slide] unfreeze", this.context.appId);
      this.slide.release();
    } else {
      this._toFreeze = -1;
    }
  };

  private onVisibilityChange = async () => {
    if (!(this.visible = document.visibilityState === "visible")) {
      this.savedIsFrozen = this.isFrozen;
      log("[Slide] freeze because tab becomes invisible");
      this.freeze();
    } else {
      log("[Slide] unfreeze because tab becomes visible", { savedIsFrozen: this.savedIsFrozen });
      if (!this.savedIsFrozen) {
        this.unfreeze();
      }
    }
  };
}
