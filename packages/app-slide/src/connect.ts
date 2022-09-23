import type { AppContext, WhiteBoardView } from "@netless/window-manager";
import type { SideEffectManager } from "side-effect-manager";
import type { SlideViewer } from "./SlideViewer";

import { get } from "./utils";

export interface ConnectParams {
  context: AppContext;
  viewer: SlideViewer;
  sideEffect: SideEffectManager;
  logger: { info: (msg: string) => void };
}

export function connect({ context, viewer, sideEffect, logger }: ConnectParams) {
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
      const disposerID = sideEffect.push(
        context.storage.on("stateChanged", () => {
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
      // log("[Slide] save state " + dump_state(slide.slideState));
      context.storage.setState({ state: slide.slideState });
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
  viewer.setReadonly(!context.isWritable);
  sideEffect.push(
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
