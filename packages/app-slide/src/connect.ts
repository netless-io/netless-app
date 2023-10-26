import type { AppContext, Storage, WhiteBoardView } from "@netless/window-manager";
import type { SideEffectManager } from "side-effect-manager";
import type { SlideViewer } from "./SlideViewer";
import type { Attributes } from "./typings";

import { get, wrap_class } from "./utils";

export interface ConnectParams {
  context: AppContext;
  storage: Storage<Attributes>;
  viewer: SlideViewer;
  sideEffect: SideEffectManager;
  logger: { info: (msg: string) => void };
}

export function connect({ context, storage, viewer, sideEffect, logger }: ConnectParams) {
  const log = logger.info.bind(logger);

  let whiteboard: WhiteBoardView | null = null;

  viewer.prepare(({ width, height, slideCount }) => {
    if (context.destroyed) return;
    width && context.box.setStageRatio(height / width);
    whiteboard = context.createWhiteBoardView({ size: slideCount });
    whiteboard.setBaseRect({ width, height });

    viewer._slideTitle = context.box.title;
    viewer._getWhiteSnapshot = (
      index: number,
      canvas: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D
    ) => {
      if (!whiteboard) {
        return null;
      }
      const scenePath = whiteboard.pageState.pages[index - 1];
      const { width, height } = whiteboard.view.size;
      canvas.width = width;
      canvas.height = height;
      whiteboard.view.screenshotToCanvas(ctx, scenePath, width, height, whiteboard.view.camera);
    };

    kick_start();
  });

  const { slide } = viewer;

  function dump_state(state: unknown = storage.state.state) {
    return JSON.stringify(state);
  }

  function kick_start() {
    if (storage.state.state) {
      log("[Slide] restore " + dump_state());
      slide.setSlideState(storage.state.state);
    } else if (context.isAddApp) {
      log("[Slide] kick start");
      slide.renderSlide(1);
    } else {
      log("[Slide] wait for restore");
      const timeoutID = sideEffect.add(() => {
        const timer = setInterval(() => {
          if (!storage.state.state) {
            log("[Slide] timeout");
            slide.renderSlide(1);
          }
        }, 15 * 1000);
        return () => clearInterval(timer);
      });
      const disposerID = sideEffect.push(
        storage.on("stateChanged", () => {
          if (storage.state.state) {
            log("[Slide] restore " + dump_state());
            slide.setSlideState(storage.state.state);
            sideEffect.flush(disposerID);
            sideEffect.flush(timeoutID);
          }
        })
      );
    }
  }

  // setup sync event
  slide.on("stateChange", () => {
    if (storage.isWritable) {
      // log("[Slide] save state " + dump_state(slide.slideState));
      storage.setState({ state: slide.slideState });
    }
  });
  slide.on("syncDispatch", payload => {
    if (context.isWritable) {
      log("[Slide] dispatch " + dump_state(get(payload, "uuid")));
      context.dispatchMagixEvent("syncDispatch", payload);
    }
  });
  sideEffect.push(
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
  function disable_whiteboard() {
    if (whiteboard && whiteboard.view.divElement) {
      whiteboard.view.divElement.classList.add(wrap_class("wb-view-hidden"));
    }
  }

  function enable_whiteboard() {
    if (whiteboard && whiteboard.view.divElement) {
      whiteboard.view.divElement.classList.remove(wrap_class("wb-view-hidden"));
    }
  }

  viewer.setReadonly(!context.isWritable);
  sideEffect.push([
    context.emitter.on("writableChange", () => viewer.setReadonly(!context.isWritable)),
    viewer.events.on("renderStart", disable_whiteboard),
    viewer.events.on("renderEnd", enable_whiteboard),
  ]);

  const isEditable = (el: EventTarget | null) => {
    if (!el) return false;
    const tagName = (el as HTMLElement).tagName;
    return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
  };

  sideEffect.addEventListener(window, "keydown", ev => {
    if (!ev || (ev.target as HTMLElement).className === "telebox-quarantine-outer") return;
    if (context.box.focus && !context.box.readonly && !isEditable(ev.target)) {
      if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") {
        viewer.slide.prevStep();
      }
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
        viewer.slide.nextStep();
      }
    }
  });
}
