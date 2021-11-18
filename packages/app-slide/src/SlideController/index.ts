// this controller does these things:
// 1. map slide events to ui
// 2. make sure to init correctly
//    - the one with (context.isAddApp === true) should call renderSlide(1)
//    - others wait for first sync event and restore from sync state
//    - if none of above happen, force doing renderSlide(1) after timeout
// 3. send/receive slide sync events
// 4. automatically re-create scenes to sync strokes, a view must be existing
// 5. pages information are loaded dynamically by the slide package

import type { Event as MagixEvent } from "white-web-sdk";
import type { AppContext, Player, Room } from "@netless/window-manager";
import type { SyncEvent } from "@netless/slide";
import type { Attributes, MagixPayload, SlideState } from "../typings";

import { SideEffectManager } from "side-effect-manager";
import { Slide, SLIDE_EVENTS } from "@netless/slide";
import { clamp, deepClone, isObj } from "../utils/helpers";
export { syncSceneWithSlide, createDocsViewerPages } from "./helpers";

export const DefaultUrl = "https://convertcdn.netless.link/dynamicConvert";
export const MaxPollCount = 40; // 500ms * 40 times = 20s
export const EmptyAttributes: Attributes = {
  taskId: "",
  url: "",
  state: null,
};

export interface SlideControllerOptions {
  context: AppContext<Attributes>;
  anchor: HTMLDivElement;
  onPageChanged: (page: number) => void;
  onTransitionStart: () => void;
  onTransitionEnd: () => void;
  onError: (args: { error: Error }) => void;
}

export class SlideController {
  public readonly context: SlideControllerOptions["context"];
  public readonly slide: Slide;
  public readonly debug: boolean;

  private readonly channel: string;
  private readonly room?: Room;
  private readonly player?: Player;
  private readonly sideEffect = new SideEffectManager();

  private readonly onPageChanged: SlideControllerOptions["onPageChanged"];
  private readonly onTransitionStart: SlideControllerOptions["onTransitionStart"];
  private readonly onTransitionEnd: SlideControllerOptions["onTransitionEnd"];
  private readonly onError: SlideControllerOptions["onError"];

  private syncStateOnceFlag: boolean;

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
    this.channel = `channel-${context.appId}`;
    this.room = context.getRoom();
    this.player = this.room ? undefined : (context.getDisplayer() as Player);
    this.debug = import.meta.env.DEV || !!context.getAppOptions()?.debug;
    this.slide = this.createSlide(anchor);
    // the adder does not need to sync state
    this.syncStateOnceFlag = !this.context.isAddApp;
    this.initialize();
  }

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
    const { taskId, url, state } = { ...EmptyAttributes, ...this.context.getAttributes() };
    slide.setResource(taskId, url || DefaultUrl);
    if (state) {
      // if we already have state, try restore from it
      if (this.debug) {
        console.log("[Slide] init with state", deepClone(state));
      }
      slide.setSlideState(deepClone(state));
    } else if (context.isAddApp) {
      // otherwise, maybe this slide is just added, let the adder kick start first render
      if (this.debug) {
        console.log("[Slide] init by renderSlide", 1);
      }
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
    this.sideEffect.add(() => {
      const disposer = context.mobxUtils.reaction(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        () => context.getAttributes()!.state,
        () => {
          this.syncStateOnce();
          disposer();
        }
      );
      // mobx already has a "disposed" flag in reaction,
      // so we don't need to check it here
      return disposer;
    });

    this.sideEffect.add(() => {
      const displayer = context.getDisplayer();
      displayer.addMagixEventListener(this.channel, this.magixEventListener, {
        fireSelfEventAfterCommit: true,
      });
      // here we do not pass second param -- the listener
      // because channel name is already unique, just make it simpler
      return () => displayer.removeMagixEventListener(this.channel);
    });

    slide.on(SLIDE_EVENTS.slideChange, this.onPageChanged);
    slide.on(SLIDE_EVENTS.renderStart, this.onTransitionStart);
    slide.on(SLIDE_EVENTS.renderEnd, this.onTransitionEnd);
    slide.on(SLIDE_EVENTS.mainSeqStepStart, this.onTransitionStart);
    slide.on(SLIDE_EVENTS.mainSeqStepEnd, this.onTransitionEnd);
    slide.on(SLIDE_EVENTS.renderError, this.onError);
    slide.on(SLIDE_EVENTS.stateChange, this.onStateChange);
    slide.on(SLIDE_EVENTS.syncDispatch, this.onSyncDispatch);
  }

  private onSyncDispatch = (event: SyncEvent) => {
    if (this.context.getIsWritable() && this.room) {
      const payload: MagixPayload = {
        type: SLIDE_EVENTS.syncDispatch,
        payload: event,
      };
      if (this.debug) {
        console.log("[Slide] dispatch", event);
      }
      this.room.dispatchMagixEvent(this.channel, payload);
    }
  };

  private magixEventListener = (ev: MagixEvent) => {
    if (ev.event === this.channel && isObj(ev.payload)) {
      const { type, payload } = ev.payload as MagixPayload;
      if (type === SLIDE_EVENTS.syncDispatch) {
        this.syncStateOnce();
        if (this.debug) {
          console.log("[Slide] receive", payload);
        }
        // only emit the event if the slide state is sync-ed
        if (!this.syncStateOnceFlag) {
          this.slide.emit(SLIDE_EVENTS.syncReceive, payload);
        }
      }
    }
  };

  private syncStateOnce() {
    // sync state before the first event, so that they can be in the correct order
    if (this.syncStateOnceFlag) {
      const { state } = { ...EmptyAttributes, ...this.context.getAttributes() };
      if (state) {
        if (this.debug) {
          console.log("[Slide] sync with state (once)", deepClone(state));
        }
        this.slide.setSlideState(deepClone(state));
        this.syncStateOnceFlag = false;
      }
    }
  }

  private onStateChange = (state: SlideState) => {
    if (this.context.getIsWritable()) {
      this.context.updateAttributes(["state"], state);
    }
  };

  private resolveReady!: () => void;
  public readonly readyPromise = new Promise<void>(resolve => {
    this.resolveReady = resolve;
  });

  private pollCount = 0;
  private pollReadyState = () => {
    if (this.ready) {
      this.resolveReady();
    } else if (this.pollCount < MaxPollCount) {
      this.pollCount++;
      setTimeout(this.pollReadyState, 500);
    } else {
      this.pollCount = 0;
      if (this.debug) {
        console.log("[Slide] renderSlide (retry after timeout)", 1);
      }
      this.slide.renderSlide(1);
    }
  };

  public get ready() {
    return this.slide.slideCount > 0;
  }

  public get pageCount() {
    return this.slide.slideCount;
  }

  public get page() {
    return this.slide.slideState.currentSlideIndex;
  }

  private createSlide(anchor: HTMLDivElement) {
    const slide = new Slide({
      anchor,
      interactive: true,
      mode: "interactive",
      resize: true,
      controller: this.debug,
      renderOptions: {
        minFPS: 25,
        maxFPS: 30,
        autoFPS: true,
        autoResolution: true,
        resolution: this.context.getAppOptions()?.resolution,
      },
      timestamp: this.timestamp,
    });
    if (this.debug) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).slide = slide;
    }
    return slide;
  }

  private destroyed = false;

  public destroy() {
    this.sideEffect.flushAll();
    if (!this.destroyed) {
      if (this.debug) {
        console.log("[Slide] destroy (once)");
      }
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
}
