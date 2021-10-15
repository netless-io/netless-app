import type { NetlessApp } from "@netless/window-manager";
import type { Event } from "white-web-sdk";

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

    const createSlide = (anchor: HTMLDivElement) => {
      const slide = new Slide({
        anchor,
        interactive: true,
      });

      slide.setResource(attrs.taskId, attrs.url);

      const channel = `channel-${context.appId}`;
      slide.on(SLIDE_EVENTS.syncDispatch, (payload: unknown) => {
        context.updateAttributes(["state"], slide.slideState);
        context.getRoom()?.dispatchMagixEvent(channel, payload);
      });
      const magixEventListener = (ev: Event) => {
        if (ev.event === channel && ev.authorId !== displayer.observerId) {
          // TODO: slide.emit(SLIDE_EVENTS.syncReceive, ev.payload)
          attrs.state && slide.setSlideState(attrs.state);
        }
      };
      sideEffect.add(() => {
        displayer.addMagixEventListener(channel, magixEventListener);
        return () => displayer.removeMagixEventListener(channel);
      });

      if (import.meta.env.DEV) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).slide = slide;
      }

      return slide;
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
    }).mount();

    context.mountView(docsViewer.$whiteboardView);

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
