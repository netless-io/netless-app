import type { NetlessApp } from "@netless/window-manager";
import type { Event, ScenePathType } from "white-web-sdk";

import { ensureAttributes } from "@netless/app-shared";
import { Slide, SLIDE_EVENTS } from "@netless/slide";
import { SideEffectManager } from "side-effect-manager";
import { SlideDocsViewer } from "./SlideDocsViewer";
import styles from "./style.scss?inline";

export type SlideState = Slide["slideState"];

export interface Attributes {
  /** convert task id */
  taskId: string;
  /** base url of converted resources */
  url: string;
  /** internal state of slide, do not change */
  state: SlideState | null;
}

const SlideApp: NetlessApp<Attributes> = {
  kind: "Slide",
  setup(context) {
    const room = context.getRoom();
    const displayer = context.getDisplayer();

    const box = context.getBox();

    const whiteboardView = context.getView();

    const attrs = ensureAttributes(context, {
      state: null,
      taskId: "",
      url: "",
    });

    if (!whiteboardView) {
      throw new Error("[Slide]: no whiteboard view.");
    }

    box.mountStyles(styles);

    const sideEffect = new SideEffectManager();

    let theSlide: Slide | undefined;

    const createSlide = (anchor: HTMLDivElement) => {
      const slide = new Slide({
        anchor,
        interactive: true,
      });

      slide.setResource(attrs.taskId, attrs.url);

      const channel = `channel-${context.appId}`;
      slide.on(SLIDE_EVENTS.syncDispatch, (payload: unknown) => {
        context.updateAttributes(["state"], slide.slideState);
        const room = context.getRoom();
        if (room) {
          room.dispatchMagixEvent(channel, { type: SLIDE_EVENTS.syncDispatch, payload });
        }
      });
      sideEffect.add(() => {
        const magixEventListener = (ev: Event) => {
          if (ev.event === channel && ev.authorId !== displayer.observerId) {
            const { type, payload } = ev.payload;
            if (type === SLIDE_EVENTS.syncDispatch) {
              slide.emit(SLIDE_EVENTS.syncReceive, payload);
            }
          }
        };
        displayer.addMagixEventListener(channel, magixEventListener);
        return () => displayer.removeMagixEventListener(channel);
      });

      if (import.meta.env.DEV) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).slide = slide;
      }

      theSlide = slide;
      return slide;
    };

    const baseScenePath = context.getInitScenePath();
    const refreshScenes = (): void => {
      if (theSlide?.slideCount && baseScenePath && room && context.getIsWritable()) {
        const maxPage = theSlide.slideCount;
        const scenePath = `${baseScenePath}/${maxPage}`;
        if (room.scenePathType(scenePath) === ("none" as ScenePathType)) {
          room.removeScenes(baseScenePath);
          const scenes: { name: string }[] = [];
          for (let i = 1; i <= maxPage; ++i) {
            scenes.push({ name: `${i}` });
          }
          room.putScenes(baseScenePath, scenes);
          context.setScenePath(`${baseScenePath}/${theSlide.slideState.currentSlideIndex || 1}`);
        }
      }
    };

    const docsViewer = new SlideDocsViewer({
      displayer,
      whiteboardView,
      createSlide,
      box,
      mountWhiteboard: context.mountView.bind(context),
      readonly: box.readonly,
      setSceneIndex: index => {
        context.getRoom()?.setSceneIndex(index);
      },
      refreshScenes,
    }).mount();

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).slideDoc = docsViewer;
    }

    context.emitter.on("sceneStateChange", sceneState => {
      docsViewer.jumpToPage(sceneState.index);
    });

    box.events.on("readonly", readonly => {
      docsViewer.setReadonly(readonly);
    });

    context.emitter.on("destroy", () => {
      console.log("[Slide]: destroy");
      sideEffect.flushAll();
    });
  },
};

export default SlideApp;
