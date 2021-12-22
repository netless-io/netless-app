import type { NetlessApp } from "@netless/window-manager";
import type { RoomState } from "white-web-sdk";
import type { MountSlideOptions } from "./SlideDocsViewer";
import type { Attributes } from "./typings";
import type { AddHooks, FreezableSlide } from "./utils/freezer";
import { useFreezer } from "./utils/freezer";

import { SideEffectManager } from "side-effect-manager";
import { ensureAttributes } from "@netless/app-shared";
import {
  DefaultUrl,
  EmptyAttributes,
  syncSceneWithSlide,
  SlideController,
} from "./SlideController";
import { SlideDocsViewer } from "./SlideDocsViewer";
import { apps, FreezerLength, addHooks } from "./utils/freezer";
import { log, logger } from "./utils/logger";
import styles from "./style.scss?inline";

export type { PreviewParams } from "./SlidePreviewer";
export { SlidePreviewer, default as previewSlide } from "./SlidePreviewer";

export type { Attributes, AddHooks, FreezableSlide };

export const version = "0.0.52";

export { DefaultUrl, apps, FreezerLength, addHooks };

const SlideApp: NetlessApp<Attributes> = {
  kind: "Slide",
  setup(context) {
    console.log("[Slide] setup @ " + version);

    if (context.getIsWritable()) {
      ensureAttributes(context, EmptyAttributes);
    }

    const attributes = context.getAttributes();
    if (!attributes?.taskId) {
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
        log("[Slide] page to", page, synced);
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
      (logger.apps[context.appId] ||= {}).controller = slideController;
      if (import.meta.env.DEV) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).slideController = slideController;
      }
      slideController.readyPromise.then(options.onReady);
      return slideController;
    };

    docsViewer = new SlideDocsViewer({
      box,
      view,
      mountSlideController,
      mountWhiteboard: context.mountView.bind(context),
    });

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).slideDoc = docsViewer;
    }

    const room = context.getRoom();
    const sideEffect = new SideEffectManager();

    sideEffect.add(() => {
      (logger.apps[context.appId] ||= {}).context = context;
      logger.enable = context.getAppOptions()?.debug || import.meta.env.DEV;
      logger.level = import.meta.env.DEV ? "verbose" : "debug";
      return () => logger.dispose(context.appId);
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
      log("[Slide]: destroy");
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
