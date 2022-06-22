import type { Event } from "white-web-sdk";
import type { NetlessApp } from "@netless/window-manager";
import type { Path } from "./paper";
import type { BroadcastEvent, Curve, PID, Point } from "./typings";

import { ensureAttributes } from "@netless/app-shared";
import { SideEffectManager } from "side-effect-manager";
import FitCurve from "./fit-curve-worker?worker";
import Paper, { simulateDrawing } from "./paper";

export interface Attributes {
  curves: Record<PID, Curve[]>;
}

const Paint: NetlessApp<Attributes> = {
  kind: "Paint",
  setup(context) {
    const { appId } = context;
    const box = context.box;
    const room = context.room;
    const displayer = context.displayer;
    const attrs = ensureAttributes(context, {
      curves: {},
    });
    box.setHighlightStage(false);

    const svg = Paper.createSVGElement();
    svg.setAttribute("fill", "transparent");
    svg.setAttribute("stroke", box.darkMode ? "#fff" : "#000");
    svg.setAttribute("stroke-width", "2");
    Object.assign(svg.style, {
      display: "block",
      width: "100%",
      height: "100%",
    });
    box.mountContent(svg as unknown as HTMLElement);
    box.$content?.addEventListener("touchstart", e => e.preventDefault());
    box.$content?.addEventListener("touchmove", e => e.preventDefault());

    const sideEffect = new SideEffectManager();

    sideEffect.addDisposer(
      box.onValChanged("darkMode", darkMode => {
        svg.setAttribute("stroke", darkMode ? "#fff" : "#000");
      })
    );

    const fitCurve = new FitCurve();

    const channel = `channel-${appId}`;

    const broadcast = (payload: BroadcastEvent) => {
      if (context.isWritable) {
        room?.dispatchMagixEvent(channel, payload);
      }
    };

    type PathInfo = {
      points: Point[];
      path: Path;
      timeStamp?: number;
    };

    const paths: Record<PID, PathInfo> = {};

    const magixEventListener = (ev: Event) => {
      if (ev.event === channel && ev.authorId !== displayer.observerId) {
        const { clear, pid, done }: BroadcastEvent = ev.payload;
        if (clear) {
          paper.clear();
          paper.initCurves(attrs.curves);
        }
        if (pid) {
          if (done) {
            simulateDrawing(paper, attrs.curves[pid]);
          }
        }
      }
    };

    sideEffect.add(() => {
      displayer.addMagixEventListener(channel, magixEventListener);
      return () => displayer?.removeMagixEventListener(channel);
    });

    const paper = new Paper(
      svg,
      // onDraw
      (pid: PID, point: Point, timeStamp: number) => {
        let item = paths[pid];
        if (!item) {
          item = paths[pid] = { points: [], path: paper.newPath() };
        }
        item.points.push(point);
        item.path.replace(item.points);
        item.timeStamp = timeStamp;
      },
      // onDrawEnd
      (pid: PID) => {
        const item = paths[pid];
        if (!item) return;
        if (item.points.length < 2) {
          item.path.remove();
        } else {
          fitCurve.postMessage({ id: pid, path: item.points, error: 5 });
        }
        delete paths[pid];
      }
    );

    paper.initCurves(attrs.curves);

    fitCurve.onmessage = (ev: MessageEvent<{ id: string; curves: ReadonlyArray<Curve> }>) => {
      const { id: pid, curves } = ev.data;
      if (context.isWritable) {
        context.updateAttributes(["curves", pid], curves);
        broadcast({ pid, done: true });
      }
    };

    box.mountStyles(`
      .telebox-color-scheme-dark .netless-app-paint-clear-btn {
        color-scheme: dark;
      }
    `);
    const clearBtn = document.createElement("button");
    clearBtn.classList.add("netless-app-paint-clear-btn");
    clearBtn.textContent = "CLEAR ALL";
    clearBtn.addEventListener("click", () => {
      paper.clear();
      context.updateAttributes(["curves"], {});
      broadcast({ clear: true });
    });
    const wrapper = document.createElement("div");
    wrapper.append(clearBtn);
    Object.assign(wrapper.style, {
      display: "flex",
      justifyContent: "center",
    });
    box.mountFooter(wrapper);

    context.emitter.on("destroy", () => {
      console.log("[Paint]: destroy");
      sideEffect.flushAll();
      paper.destroy();
    });
  },
};

export default Paint;
