import type { NetlessApp } from "@netless/window-manager";
import type { RoomState } from "white-web-sdk";
import type { ISlideConfig } from "@netless/slide";
import type { MountSlideOptions } from "./SlideDocsViewer";
import type { Attributes, MagixEvents } from "./typings";
import type { AddHooks, FreezableSlide } from "./utils/freezer";

import { Slide } from "@netless/slide";
import { SideEffectManager } from "side-effect-manager";
import {
  DefaultUrl,
  EmptyAttributes,
  syncSceneWithSlide,
  SlideController,
} from "./SlideController";
import { SlideDocsViewer } from "./SlideDocsViewer";
import { apps, FreezerLength, addHooks, useFreezer } from "./utils/freezer";
import { log, logger } from "./utils/logger";
import styles from "./style.scss?inline";

export type { PreviewParams } from "./SlidePreviewer";
export { SlidePreviewer, default as previewSlide } from "./SlidePreviewer";

export type { Attributes, AddHooks, FreezableSlide };
export { Slide };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const usePlugin: (plugin: any) => any = /* @__PURE__ */ Slide.usePlugin.bind(Slide);

export const version = __APP_VERSION__;

export { DefaultUrl, apps, FreezerLength, addHooks };

export { setFreezerLength, getFreezerLength, onCreated, onDestroyed } from "./utils/freezer";

export interface AppOptions
  extends Pick<
    ISlideConfig,
    | "rtcAudio"
    | "useLocalCache"
    | "resourceTimeout"
    | "loaderDelegate"
    | "urlInterrupter"
    | "navigatorDelegate"
    | "fixedFrameSize"
    | "logger"
    | "enableGlobalClick"
    | "skipActionWhenFrozen"
  > {
  /** show debug controller */
  debug?: boolean;
  /** scale */
  resolution?: number;
  /** background color for slide animations */
  bgColor?: string;
  /** minimal fps @default 25 */
  minFPS?: number;
  /** maximal fps @default 30 */
  maxFPS?: number;
  /** automatically decrease fps @default true */
  autoFPS?: boolean;
  /** whether to re-scale automatically @default true */
  autoResolution?: boolean;
  /** 0~4, default: 3 */
  maxResolutionLevel?: number;
  /** use canvas2d mode, downside: some 3d effects are lost */
  forceCanvas?: boolean;
  /** fix windows 11 nvidia rendering bug, downside: render next page slows down */
  enableNvidiaDetect?: boolean;
  /** custom error handler */
  onRenderError?: (error: Error, pageIndex: number) => void;
  /** whether to show an overlay of error message @default: true */
  showRenderError?: boolean;
  /** Specify the behavior after hiding the slide; Freeze will destroy the slide and replace it with a snapshot, while Pause simply pauses the slide @default: 'frozen' */
  invisibleBehavior?: "frozen" | "pause";
  /** just readonly, no operate silder */
  justSildeReadonly?: true;
}

export interface ILogger {
  info?(msg: string): void;
  error?(msg: string): void;
  warn?(msg: string): void;
}

export interface AppResult {
  viewer: () => SlideDocsViewer | null;
  controller: () => SlideController | null | undefined;
  slide: () => Slide | undefined;
  position: () => [page: number, pageCount: number] | undefined;
  nextStep: () => boolean;
  prevStep: () => boolean;
  nextPage: () => boolean;
  prevPage: () => boolean;
  jumpToPage: (page: number) => boolean;
  setSildeReadonly: (bol: boolean) => void;
}

const SlideApp: NetlessApp<Attributes, MagixEvents, AppOptions, AppResult> = {
  kind: "Slide",
  setup(context) {
    console.log("[Slide] setup @ " + version);

    if (context.getIsWritable()) {
      context.storage.ensureState(EmptyAttributes);
    }

    if (!context.storage.state.taskId) {
      throw new Error("[Slide] no taskId");
    }

    const view = context.getView();
    if (!view) {
      throw new Error("[Slide] no view, please set scenePath on addApp()");
    }
    view.disableCameraTransform = true;

    const box = context.getBox();
    box.mountStyles(styles);
    try {
      box.$content.dataset.appSlideVersion = version;
    } catch {
      // ignore
    }

    // must exist because of view
    const baseScenePath = context.getInitScenePath() as string;

    let docsViewer: SlideDocsViewer | null = null;

    const onPageChanged = (page: number) => {
      const room = context.getRoom();
      if (docsViewer && docsViewer.slideController) {
        let synced = false;
        if (room && context.getIsWritable()) {
          syncSceneWithSlide(room, context, docsViewer.slideController.slide, baseScenePath);
          synced = true;
        }
        log("[Slide] page to", page, synced ? "(synced)" : "");
        docsViewer.viewer.setPageIndex(page - 1);
        docsViewer.viewer.setPaused();
        docsViewer.onPageChanged();
        const length = docsViewer.viewer.pages.length;
        if (length > 0) {
          context.dispatchAppEvent("pageStateChange", { index: page - 1, length });
        }
      }
    };

    const mountSlideController = (options: MountSlideOptions): SlideController => {
      const appOptions = context.getAppOptions() || {};

      const slideController = new SlideController({
        context,
        ...options,
        onPageChanged,
        onNavigate: options.onNavigate,
        onRenderError: appOptions.onRenderError,
        showRenderError: appOptions.showRenderError,
        invisibleBehavior: appOptions.invisibleBehavior,
      });
      if (useFreezer) apps.set(context.appId, slideController, box);
      logger.setAppController(context.appId, slideController);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).slideController = slideController;
      }
      slideController.readyPromise.then(options.onReady).then(() => {
        const room = context.getRoom();
        let synced = false;
        if (room && context.getIsWritable()) {
          syncSceneWithSlide(room, context, slideController.slide, baseScenePath);
          synced = true;
        }
        const page = slideController.slide.slideState.currentSlideIndex;
        log("[Slide] page to", page, synced ? "(synced)" : "", "(on ready)");
        slideController.slide.on("renderEnd", options.onRenderEnd);
      });
      return slideController;
    };

    docsViewer = new SlideDocsViewer({
      context,
      box,
      view,
      mountSlideController,
      mountWhiteboard: context.mountView.bind(context),
      baseScenePath,
      appId: context.appId,
      urlInterrupter: context.getAppOptions()?.urlInterrupter,
      onPagesReady: ({ length }) => {
        const index = docsViewer?.viewer.pageIndex || 0;
        context.dispatchAppEvent("pageStateChange", { index, length });
      },
      onNavigate: (page, origin) => {
        log("[Slide] user navigate to", page, origin ? `(${origin})` : "");
      },
    });

    if (context.getAppOptions()?.justSildeReadonly) {
      docsViewer?.setJustSildeReadonly(true);
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).slideDoc = docsViewer;
    }

    const room = context.getRoom();
    const sideEffect = new SideEffectManager();

    sideEffect.add(() => {
      logger.setAppContext(context.appId, context);
      logger.enable = context.getAppOptions()?.debug || import.meta.env.DEV;
      logger.level = import.meta.env.DEV ? "verbose" : "debug";
      return () => logger.deleteApp(context.appId);
    });

    if (room) {
      docsViewer.toggleClickThrough(room.state.memberState.currentApplianceName);
      sideEffect.add(() => {
        const onRoomStateChanged = (e: Partial<RoomState>) => {
          if (e.memberState && docsViewer) {
            docsViewer.toggleClickThrough(e.memberState.currentApplianceName);
          }
        };
        room.callbacks.on("onRoomStateChanged", onRoomStateChanged);
        return () => room.callbacks.off("onRoomStateChanged", onRoomStateChanged);
      });
    }

    context.emitter.on("destroy", () => {
      log("[Slide] destroy", context.appId);
      if (useFreezer) apps.delete(context.appId);
      sideEffect.flushAll();
      if (docsViewer) {
        docsViewer.destroy();
        docsViewer = null;
      }
    });

    docsViewer.mount();

    return {
      setSildeReadonly: (bol: boolean) => {
        docsViewer?.setJustSildeReadonly(bol);
      },
      viewer: () => {
        return docsViewer;
      },
      controller: () => {
        return docsViewer?.slideController;
      },
      slide: () => {
        return docsViewer?.slideController?.slide;
      },
      nextStep: () => {
        if (docsViewer && docsViewer.slideController) {
          docsViewer?.slideController?.slide.nextStep();
          return true;
        }
        return false;
      },
      prevStep: () => {
        if (docsViewer && docsViewer.slideController) {
          docsViewer?.slideController?.slide.prevStep();
          return true;
        }
        return false;
      },
      position: () => {
        const controller = docsViewer?.slideController;
        if (controller) {
          return [controller.page, controller.pageCount] as [page: number, pageCount: number];
        }
      },
      nextPage: () => {
        const controller = docsViewer?.slideController;
        if (controller) {
          const { page, pageCount } = controller;
          if (pageCount > 0 && page < pageCount) {
            controller.jumpToPage(page + 1);
            return true;
          }
        }
        return false;
      },
      prevPage: () => {
        const controller = docsViewer?.slideController;
        if (controller) {
          const { page, pageCount } = controller;
          if (pageCount > 0 && page > 1) {
            controller.jumpToPage(page - 1);
            return true;
          }
        }
        return false;
      },
      jumpToPage: (newPage: number) => {
        const controller = docsViewer?.slideController;
        if (controller) {
          const { page, pageCount } = controller;
          if (pageCount > 0 && page > 0 && page <= pageCount) {
            controller.jumpToPage(newPage);
            return true;
          }
        }
        return false;
      },
    };
  },
};

export default SlideApp;
