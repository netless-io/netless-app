import type { AppContext, NetlessApp, Player, WhiteBoardView } from "@netless/window-manager";
import type { AddHooks, AppOptions, Attributes, MagixEvents, SlideState } from "./typings";
import type { SlideViewerOptions } from "./SlideViewer";

export type { SlideState, AddHooks, AppOptions, Attributes, MagixEvents, SlideViewerOptions };

import ColorString from "color-string";
import { SideEffectManager } from "side-effect-manager";
import { Slide } from "@netless/slide";
import { SlideViewer } from "./SlideViewer";
import { refrigerator, addHooks } from "./Refrigerator";
import { DefaultUrl } from "./constants";
import { get } from "./utils";

export { Slide, SlideViewer, refrigerator, addHooks, DefaultUrl };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const usePlugin = /* @__PURE__ */ Slide.usePlugin.bind(Slide) as (plugin: any) => void;

export const version = __APP_VERSION__;

const SlideApp: NetlessApp<Attributes, MagixEvents, AppOptions, void> = {
  kind: "Slide",
  setup(context) {
    console.log("[Slide] setup @ " + __APP_VERSION__ + " (" + context.appId + ")");

    if (!context.storage.state.taskId) {
      throw new Error("[Slide] no taskId");
    }

    const appOptions = context.getAppOptions() || {};
    const options = appOptions.renderOptions || {};
    const logger = make_logger(context, appOptions.debug);
    logger.info("[Slide] setup @ " + __APP_VERSION__);

    const sideEffect = new SideEffectManager();

    // Create UI
    const viewer = new SlideViewer({
      interactive: true,
      mode: "interactive",
      resize: true,
      enableGlobalClick: true,
      timestamp: make_timestamp(context),
      logger: appOptions.logger || logger,
      renderOptions: {
        minFPS: options.minFPS || 25,
        maxFPS: options.maxFPS || 30,
        autoFPS: options.autoFPS ?? true,
        autoResolution: options.autoResolution ?? true,
        resolution: options.resolution,
        maxResolutionLevel: options.maxResolutionLevel,
        transactionBgColor: options.transactionBgColor || make_bg_color(context.box.$content),
      },
      rtcAudio: appOptions.rtcAudio,
      useLocalCache: appOptions.useLocalCache,
      resourceTimeout: appOptions.resourceTimeout,
      loaderDelegate: appOptions.loaderDelegate,
      navigatorDelegate: appOptions.navigatorDelegate,
      fixedFrameSize: appOptions.fixedFrameSize,
      taskId: context.storage.state.taskId,
      url: context.storage.state.url,
    });

    // For debugging.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (viewer as any).context = context;

    sideEffect.addDisposer(refrigerator.set(context.appId, viewer));

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).slideViewer = viewer;
    }

    // Mount UI
    context.box.mountStyles(SlideViewer.styles);
    context.box.mountStage(viewer.$slide);
    context.box.mountFooter(viewer.$footer);
    context.box.mountContent(viewer.$content);
    sideEffect.addDisposer(() => viewer.destroy());

    // Connect UI with Netless App
    connect({ context, viewer, sideEffect, logger });

    onUnmount(context, () => {
      logger.info("[Slide] destroy");
      sideEffect.flushAll();
    });

    return viewer;
  },
};

export default SlideApp;

export function previewSlide(options: SlideViewerOptions & { container: HTMLElement }) {
  const { container, ...slideOptions } = options;
  const wrapper = document.createElement("div");
  wrapper.className = "netless-app-slide-preview-wrapper";
  const viewer = new SlideViewer(slideOptions);
  wrapper.appendChild(document.createElement("style")).textContent = SlideViewer.styles;
  wrapper.appendChild(viewer.$content);
  wrapper.appendChild(viewer.$footer);
  container.appendChild(wrapper);
  viewer.prepare(() => viewer.slide.renderSlide(1));
  return viewer;
}

if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).previewSlide = previewSlide;
}

function make_timestamp(context: AppContext): () => number {
  const room = context.room;
  const player = context.displayer as Player;
  if (room) {
    return () => room.calibrationTimestamp;
  } else if (player) {
    return () => player.beginTimestamp + player.progressTime;
  } else {
    return () => Date.now();
  }
}

function make_logger(context: AppContext, debug?: boolean): { info: (msg: string) => void } {
  void debug; // not used for now
  const suffix = " (" + context.appId + ")";
  if (import.meta.env.DEV) {
    return {
      info(msg: string) {
        console.debug(msg + suffix);
      },
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomLogger = (context.displayer as any).logger;
  return {
    info(msg: string) {
      roomLogger.info(msg + suffix);
    },
  };
}

function make_bg_color(el: HTMLElement): string {
  try {
    let bg = window.getComputedStyle(el).backgroundColor;
    if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      bg = hex(bg);
      console.log("[Slide] guess bg color:", bg);
      return bg;
    }
    if (el.parentElement) {
      return make_bg_color(el.parentElement);
    }
  } catch {
    // ignored
  }
  return "#ffffff";
}

// https://github.com/Qix-/color-convert/blob/8dfdbbc6b46fa6a305bf394d942cc1b08e23fca5/conversions.js#L616
function hex(color: string): string {
  const result = ColorString.get(color);
  if (result && result.model === "rgb") {
    const args = result.value;

    const integer =
      ((Math.round(args[0]) & 0xff) << 16) +
      ((Math.round(args[1]) & 0xff) << 8) +
      (Math.round(args[2]) & 0xff);

    const string = integer.toString(16);
    return "#" + "000000".substring(string.length) + string;
  } else {
    return color;
  }
}

function onUnmount(context: AppContext, callback: () => void) {
  context.emitter.on("destroy", callback);
}

interface ConnectParams {
  context: AppContext;
  viewer: SlideViewer;
  sideEffect: SideEffectManager;
  logger: { info: (msg: string) => void };
}

function connect({ context, viewer, sideEffect, logger }: ConnectParams) {
  const log = logger.info.bind(logger);

  let whiteboard: WhiteBoardView | null = null;

  viewer.prepare(({ width, height, slideCount }) => {
    if (context.destroyed) return;
    width && context.box.setStageRatio(height / width);
    whiteboard = context.createWhiteBoardView({ size: slideCount });
    whiteboard.setBaseRect({ width, height });
    kick_start();
  });

  const { slide } = viewer;

  function dump_state(state: unknown = context.storage.state.state) {
    return JSON.stringify(state);
  }

  function kick_start() {
    if (context.storage.state.state) {
      log("[Slide] restore " + dump_state());
      slide.setSlideState(context.storage.state.state);
    } else if (context.isAddApp) {
      log("[Slide] kick start");
      slide.renderSlide(1);
    } else {
      log("[Slide] wait for restore");
      const timeoutID = sideEffect.add(() => {
        const timer = setInterval(() => {
          if (!context.storage.state.state) {
            log("[Slide] timeout");
            slide.renderSlide(1);
          }
        }, 15 * 1000);
        return () => clearInterval(timer);
      });
      const disposerID = sideEffect.addDisposer(
        context.storage.addStateChangedListener(() => {
          if (context.storage.state.state) {
            log("[Slide] restore " + dump_state());
            slide.setSlideState(context.storage.state.state);
            sideEffect.flush(disposerID);
            sideEffect.flush(timeoutID);
          }
        })
      );
    }
  }

  // setup sync event
  slide.on("stateChange", () => {
    if (context.isWritable) {
      log("[Slide] save state " + dump_state(slide.slideState));
      context.storage.setState({ state: slide.slideState });
    }
  });
  slide.on("syncDispatch", payload => {
    if (context.isWritable) {
      log("[Slide] dispatch " + dump_state(payload));
      context.dispatchMagixEvent("syncDispatch", payload);
    }
  });
  sideEffect.addDisposer(
    context.addMagixEventListener(
      "syncDispatch",
      ({ payload }) => {
        log("[Slide] receive " + dump_state(get(payload, "uuid")));
        slide.emit("syncReceive", payload);
      },
      { fireSelfEventAfterCommit: true }
    )
  );

  // save state
  slide.on("slideChange", page => {
    if (context.isWritable && whiteboard) {
      log("[Slide] page to " + page);
      whiteboard.jumpPage(page - 1);
    }
  });

  // handle ui events
  viewer.setReadonly(!context.isWritable);
  sideEffect.addDisposer(
    context.emitter.on("writableChange", w => {
      viewer.setReadonly(!w);
    })
  );

  sideEffect.addEventListener(window, "keydown", ev => {
    if (context.box.focus) {
      if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
        viewer.slide.prevStep();
      }
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
        viewer.slide.nextStep();
      }
    }
  });
}
