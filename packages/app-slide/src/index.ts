import type { NetlessApp } from "@netless/window-manager";
import type { ISlideConfig } from "@netless/slide";
import type { SlideViewerOptions } from "./SlideViewer";
import type { AddHooks, AppOptions, Attributes, MagixEvents, SlideState } from "./typings";

export type { SlideState, AddHooks, AppOptions, Attributes, MagixEvents, SlideViewerOptions };

import { Slide } from "@netless/slide";
import { SideEffectManager } from "side-effect-manager";

import { DefaultUrl } from "./constants";
import { addHooks, refrigerator } from "./Refrigerator";
import { SlideViewer } from "./SlideViewer";
import { Logger } from "./Logger";
import { connect } from "./connect";
import { previewSlide } from "./preview";
import { make_bg_color, make_timestamp } from "./utils";

export { Slide, SlideViewer, refrigerator, addHooks, DefaultUrl, previewSlide };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const usePlugin = /* @__PURE__ */ Slide.usePlugin.bind(Slide) as (plugin: any) => void;

export const version = __APP_VERSION__;

const SlideApp: NetlessApp<Attributes, MagixEvents, AppOptions, void> = {
  kind: "Slide",
  config: { enableShadowDOM: false },
  setup(context) {
    console.log("[Slide] setup @ " + __APP_VERSION__ + " (" + context.appId + ")");

    const logger = new Logger(context);
    logger.info("[Slide] setup @ " + __APP_VERSION__);

    if (!context.attributes.taskId) {
      throw new Error("[Slide] no taskId");
    }

    const storage = context.createStorage("slide", context.attributes);

    const appOptions = context.getAppOptions() || {};
    const renderOptions = appOptions.renderOptions || {};

    const sideEffect = new SideEffectManager();
    const hasTracker = context.displayer as unknown as { tracker: ISlideConfig["whiteTracker"] };

    // Create UI
    const viewer = new SlideViewer({
      interactive: true,
      mode: "interactive",
      enableGlobalClick: true,
      timestamp: make_timestamp(context),
      logger: appOptions.logger || logger,
      whiteTracker: hasTracker.tracker,
      renderOptions: {
        minFPS: renderOptions.minFPS || 25,
        maxFPS: renderOptions.maxFPS || 30,
        autoFPS: renderOptions.autoFPS ?? true,
        autoResolution: renderOptions.autoResolution ?? true,
        resolution: renderOptions.resolution,
        maxResolutionLevel: renderOptions.maxResolutionLevel,
        transactionBgColor: renderOptions.transactionBgColor || make_bg_color(context.box.$content),
      },
      rtcAudio: appOptions.rtcAudio,
      useLocalCache: appOptions.useLocalCache,
      resourceTimeout: appOptions.resourceTimeout,
      loaderDelegate: appOptions.loaderDelegate,
      navigatorDelegate: appOptions.navigatorDelegate,
      fixedFrameSize: appOptions.fixedFrameSize,
      taskId: storage.state.taskId,
      url: storage.state.url,
    });

    // For debugging.
    Object.assign(viewer, { context, logger });

    sideEffect.push(refrigerator.set(context.appId, viewer, context.box));

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).slideViewer = viewer;
    }

    // Log more
    sideEffect.push(viewer.events.on("freeze", () => logger.info("[Slide] freeze")));
    sideEffect.push(viewer.events.on("unfreeze", () => logger.info("[Slide] unfreeze")));
    sideEffect.push(
      viewer.events.on("prepareError", error =>
        logger.info("[Slide] fetch slide info failed: " + error.message)
      )
    );
    sideEffect.push(
      viewer.events.on("renderError", ({ error, index }) =>
        logger.info("[Slide] render failed " + `[${index}]: ${error.message}`)
      )
    );

    // Mount UI
    context.box.mountStyles(SlideViewer.styles);
    context.box.mountStage(viewer.$slide);
    context.box.mountFooter(viewer.$footer);
    context.box.mountContent(viewer.$content);
    sideEffect.push(() => viewer.destroy());

    // Connect UI with Netless App
    connect({ context, storage, viewer, sideEffect, logger });

    context.emitter.on("destroy", () => {
      logger.info("[Slide] destroy");
      logger.destroy();
      sideEffect.flushAll();
    });

    return viewer;
  },
};

export default SlideApp;
