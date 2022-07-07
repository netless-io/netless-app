import type { NetlessApp } from "@netless/window-manager";
import type { Path } from "./paper";
import type { BroadcastEvent, Curve, PID, Point } from "./typings";

import { SideEffectManager } from "side-effect-manager";
import FitCurve from "./fit-curve-worker?worker";
import Paper, { simulateDrawing } from "./paper";

export interface Attributes {
  curves: Record<PID, Curve[]>;
}

const Paint: NetlessApp<Attributes, { broadcast: BroadcastEvent }> = {
  kind: "Paint",
  setup(context) {
    const box = context.box;
    const curves = context.createStorage("curves", context.storage.state.curves || {});

    const svg = Paper.createSVGElement();
    svg.setAttribute("fill", "transparent");
    svg.setAttribute("stroke", box.darkMode ? "#fff" : "#000");
    svg.setAttribute("stroke-width", "2");
    Object.assign(svg.style, {
      display: "block",
      width: "100%",
      height: "100%",
      touchAction: "none",
    });
    box.mountContent(svg as unknown as HTMLElement);

    const sideEffect = new SideEffectManager();

    sideEffect.addDisposer(
      box.onValChanged("darkMode", darkMode => {
        svg.setAttribute("stroke", darkMode ? "#fff" : "#000");
      })
    );

    const fitCurve = new FitCurve();

    const broadcast = (payload: BroadcastEvent) => {
      if (context.isWritable) {
        context.dispatchMagixEvent("broadcast", payload);
      }
    };

    type PathInfo = {
      points: Point[];
      path: Path;
      timeStamp?: number;
    };

    const paths: Record<PID, PathInfo> = {};

    sideEffect.addDisposer(
      context.addMagixEventListener("broadcast", ({ authorId, payload }) => {
        if (authorId === context.displayer.observerId) return;
        const { clear, pid, done }: BroadcastEvent = payload;
        if (clear) {
          paper.clear();
          paper.initCurves(curves.state);
        }
        if (pid) {
          if (done) {
            simulateDrawing(paper, curves.state[pid]);
          }
        }
      })
    );

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

    paper.initCurves(curves.state);

    fitCurve.onmessage = (ev: MessageEvent<{ id: string; curves: ReadonlyArray<Curve> }>) => {
      const { id: pid, curves: data } = ev.data;
      if (context.isWritable) {
        curves.setState({ [pid]: data as Curve[] });
        broadcast({ pid, done: true });
      }
    };

    const clearBtn = document.createElement("button");
    clearBtn.classList.add("netless-app-paint-clear-btn");
    clearBtn.textContent = "CLEAR ALL";
    clearBtn.addEventListener("click", () => {
      paper.clear();
      curves.emptyStorage();
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
