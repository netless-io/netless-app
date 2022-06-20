import type { NetlessApp } from "@netless/window-manager";
import type { RoomState } from "white-web-sdk";
import type { MountSlideOptions } from "./SlideDocsViewer";
import type { Attributes, MagixEvents } from "./typings";
import type { AddHooks, FreezableSlide } from "./utils/freezer";

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

export const version = __APP_VERSION__;

export { DefaultUrl, apps, FreezerLength, addHooks };

export interface AppOptions {
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
}

const SlideApp: NetlessApp<Attributes, MagixEvents, AppOptions, void> = {
  kind: "Slide",
  setup(context) {
    console.log("[Slide] setup @ " + version);

    if (context.isWritable) {
      context.storage.ensureState(EmptyAttributes);
    }

    if (!context.storage.state.taskId) {
      throw new Error("[Slide] no taskId");
    }

    const box = context.box;
    box.mountStyles(styles);
    try {
      box.$content.dataset.appSlideVersion = version;
    } catch {
      // ignore
    }

    const view = context.createWhiteBoardView();
    (view.view as any).disableCameraTransform = true;

    let docsViewer: SlideDocsViewer | null = null;

    const onPageChanged = (page: number) => {
      const room = context.room;
      if (docsViewer && docsViewer.slideController) {
        let synced = false;
        if (room && context.isWritable) {
          syncSceneWithSlide(view, docsViewer.slideController.slide);
          synced = true;
        }
        log("[Slide] page to", page, synced ? "(synced)" : "");
        docsViewer.viewer.setPageIndex(page - 1);
      }
    };

    const mountSlideController = (options: MountSlideOptions): SlideController => {
      const slideController = new SlideController({
        context,
        ...options,
        onPageChanged,
      });
      if (useFreezer) apps.set(context.appId, slideController);
      logger.setAppController(context.appId, slideController);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).slideController = slideController;
      }
      slideController.readyPromise.then(options.onReady).then(() => {
        const room = context.room;
        let synced = false;
        if (room && context.isWritable) {
          syncSceneWithSlide(view, slideController.slide);
          synced = true;
        }
        const page = slideController.slide.slideState.currentSlideIndex;
        log("[Slide] page to", page, synced ? "(synced)" : "", "(on ready)");
      });
      return slideController;
    };

    docsViewer = new SlideDocsViewer({ box, view, mountSlideController });

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).slideDoc = docsViewer;
    }

    const room = context.room;
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
  },
};

export default SlideApp;
