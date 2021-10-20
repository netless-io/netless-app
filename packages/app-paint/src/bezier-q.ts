import type { Curve, Point } from "./typings";

onmessage = (e: MessageEvent<{ id: string; curves: Curve[]; step: number }>) => {
  const { id, curves, step } = e.data;
  const points: Point[] = [curves[0][0]];
  for (const curve of curves) {
    for (let i = 1; i <= step; ++i) {
      points.push(bezierQ(curve, i / step));
    }
  }
  postMessage({ id, points });
};

function scalarMul(p: Point, a: number): Point {
  return { x: p.x * a, y: p.y * a };
}

function addN(...points: Point[]): Point {
  return {
    x: points.reduce((s, p) => s + p.x, 0),
    y: points.reduce((s, p) => s + p.y, 0),
  };
}

function bezierQ(ctrlPoly: Curve, t: number): Point {
  const tx = 1.0 - t;
  const pA = scalarMul(ctrlPoly[0], tx ** 3);
  const pB = scalarMul(ctrlPoly[1], 3 * tx ** 2 * t);
  const pC = scalarMul(ctrlPoly[2], 3 * tx * t ** 2);
  const pD = scalarMul(ctrlPoly[3], t ** 3);
  return addN(pA, pB, pC, pD);
}
