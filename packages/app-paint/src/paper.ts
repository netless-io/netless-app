import type { Curve as CurveShape, PID, Point } from "./typings";

import { nanoid } from "nanoid";
import BezierQ from "./bezier-q?worker";

export function createSVGElement(): SVGSVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", "svg");
}

export function createPathElement(): SVGPathElement {
  return document.createElementNS("http://www.w3.org/2000/svg", "path");
}

function middle(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

function pointFromEvent(ev: PointerEvent, el: Element): Point {
  const { left, top } = el.getBoundingClientRect();
  return { x: (ev.clientX - left) | 0, y: (ev.clientY - top) | 0 };
}

const M = ({ x, y }: Point) => `M${x},${y}`;
const L = ({ x, y }: Point) => `L${x},${y}`;
const Q = (c: Point, { x, y }: Point) => `Q${c.x},${c.y} ${x},${y}`;
const C = (c1: Point, c2: Point, { x, y }: Point) => `C${c1.x},${c1.y} ${c2.x},${c2.y} ${x} ${y}`;

abstract class PathBase {
  constructor(public readonly path: SVGPathElement) {}
  public abstract replace(data: unknown): void;
  public remove() {
    this.path.remove();
  }
}

export class Path extends PathBase {
  override replace(points: Point[]): void {
    if (points.length < 2) {
      this.path.setAttribute("d", "");
    } else {
      const last = points.length - 1;
      let def = M(points[0]) + L(middle(points[0], points[1]));
      for (let i = 1; i < last; ++i) {
        def += Q(points[i], middle(points[i], points[i + 1]));
      }
      def += L(points[last]);
      this.path.setAttribute("d", def);
    }
  }
}

export class Curve extends PathBase {
  override replace(curves: CurveShape[]): void {
    if (curves.length < 1) {
      this.path.setAttribute("d", "");
    } else {
      const last = curves.length - 1;
      let def = M(curves[0][0]);
      for (let i = 0; i <= last; ++i) {
        const curve = curves[i];
        def += C(curve[1], curve[2], curve[3]);
      }
      this.path.setAttribute("d", def);
    }
  }
}

const DrawingStep = 3;
const bezierQ = new BezierQ();
const tasks = new Map<string, (points: Point[]) => void>();
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));

bezierQ.onmessage = (ev: MessageEvent<{ id: string; points: Point[] }>) => {
  const { id, points } = ev.data;
  const task = tasks.get(id);
  if (task) task(points);
};

async function startDrawing(paper: Paper, points: Point[]) {
  const path = paper.newPath();
  const { length } = points;
  for (let i = 2; i < length; ++i) {
    path.replace(points.slice(0, i));
    await nextFrame();
  }
  path.replace(points);
}

export function simulateDrawing(paper: Paper, curves: CurveShape[]): void {
  curves = curves.map(curve => curve.map(point => ({ ...point }))) as CurveShape[];
  const id = nanoid();
  tasks.set(id, points => startDrawing(paper, points));
  bezierQ.postMessage({ id, curves, step: DrawingStep });
}

export class DrawingSimulator {}

// ha ha, i'm not paper.js
export default class Paper {
  static createSVGElement = createSVGElement;

  constructor(
    public readonly target: SVGSVGElement,
    public readonly onDraw: (uid: string, point: Point, timeStamp: number) => void,
    public readonly onDrawEnd: (uid: string, timeStamp: number) => void
  ) {
    target.addEventListener("pointerdown", this.pointerDown, false);
    target.addEventListener("pointermove", this.pointerMove, false);
    target.addEventListener("pointerup", this.pointerUp, false);
    target.addEventListener("pointerleave", this.pointerUp, false);
  }

  clear() {
    let p: ChildNode | null = null;
    while ((p = this.target.firstChild)) {
      p.remove();
    }
  }

  destroy() {
    this.target.removeEventListener("pointerdown", this.pointerDown, false);
    this.target.removeEventListener("pointermove", this.pointerMove, false);
    this.target.removeEventListener("pointerup", this.pointerUp, false);
    this.target.removeEventListener("pointerleave", this.pointerUp, false);
  }

  currentPathUID = "";

  pointerDown = (ev: PointerEvent) => {
    if (ev.isPrimary) {
      this.target.setPointerCapture(ev.pointerId);
      this.currentPathUID = nanoid();
      this.onDraw(this.currentPathUID, pointFromEvent(ev, this.target), ev.timeStamp);
    }
  };

  pointerMove = (ev: PointerEvent) => {
    if (ev.isPrimary && this.currentPathUID) {
      this.onDraw(this.currentPathUID, pointFromEvent(ev, this.target), ev.timeStamp);
    }
  };

  pointerUp = (ev: PointerEvent) => {
    if (this.currentPathUID) {
      this.onDrawEnd(this.currentPathUID, ev.timeStamp);
      this.currentPathUID = "";
      this.target.releasePointerCapture(ev.pointerId);
    }
  };

  newPath(): Path {
    const path = createPathElement();
    this.target.append(path);
    return new Path(path);
  }

  newCurve(): Curve {
    const path = createPathElement();
    this.target.append(path);
    return new Curve(path);
  }

  initCurves(curves: Record<PID, CurveShape[]>) {
    for (const curveShapes of Object.values(curves)) {
      this.newCurve().replace(curveShapes);
    }
  }
}
