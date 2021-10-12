// TODO:
// https://github.com/d3/d3-delaunay

self.onmessage = (e: MessageEvent<{ id: string; path: Point[]; error: number }>) => {
  const { id, path, error } = e.data;
  postMessage({ id, curves: fitCurve(path, error) });
};

// https://github.com/odiak/fit-curve/blob/master/packages/fit-curve/src/index.ts
/**
 *  @preserve  JavaScript implementation of
 *  Algorithm for Automatically Fitting Digitized Curves
 *  by Philip J. Schneider
 *  "Graphics Gems", Academic Press, 1990
 *
 *  The MIT License (MIT)
 *
 *  https://github.com/soswow/fit-curves
 */

interface Point {
  readonly x: number;
  readonly y: number;
}

type Points = ReadonlyArray<Point>;

export type Curve = [Point, Point, Point, Point];

const zeroPoint = Object.freeze({ x: 0, y: 0 });

function distance(p0: Point, p1: Point): number {
  return Math.sqrt((p0.x - p1.x) ** 2 + (p0.y - p1.y) ** 2);
}

function norm(p: Point): number {
  return Math.sqrt(p.x ** 2 + p.y ** 2);
}

function squaredNorm(p: Point): number {
  return p.x ** 2 + p.y ** 2;
}

function add(p0: Point, p1: Point): Point {
  return { x: p0.x + p1.x, y: p0.y + p1.y };
}

function addN(...points: Point[]): Point {
  return {
    x: points.reduce((s, p) => s + p.x, 0),
    y: points.reduce((s, p) => s + p.y, 0),
  };
}

function sub(p0: Point, p1: Point): Point {
  return { x: p0.x - p1.x, y: p0.y - p1.y };
}

function scalarMul(p: Point, a: number): Point {
  return { x: p.x * a, y: p.y * a };
}

function scalarDiv(p: Point, a: number): Point {
  return { x: p.x / a, y: p.y / a };
}

function normalize(p: Point): Point {
  const len = norm(p);
  return len === 0 ? p : scalarDiv(p, len);
}

function dot(p0: Point, p1: Point): number {
  return p0.x * p1.x + p0.y * p1.y;
}

/**
 * Fit one or more Bezier curves to a set of points.
 *
 * @param points - Array of digitized points, e.g. [[5,5],[5,50],[110,140],[210,160],[320,110]]
 * @param maxError - Tolerance, squared error between points and fitted curve
 * @returns Array of Bezier curves, where each element is [first-point, control-point-1, control-point-2, second-point] and points are [x, y]
 */
export function fitCurve(points: Points, maxError: number): ReadonlyArray<Curve> {
  if (points.length < 2) {
    return [];
  }

  const length = points.length;
  const leftTangent = createTangent(points[1], points[0]);
  const rightTangent = createTangent(points[length - 2], points[length - 1]);

  return fitCubic(points, leftTangent, rightTangent, maxError);
}

/**
 * Fit a Bezier curve to a (sub)set of digitized points.
 * Your code should not call this function directly. Use {@link fitCurve} instead.
 *
 * @param points - Array of digitized points, e.g. [[5,5],[5,50],[110,140],[210,160],[320,110]]
 * @param leftTangent - Unit tangent vector at start point
 * @param rightTangent - Unit tangent vector at end point
 * @param error - Tolerance, squared error between points and fitted curve
 * @returns Array of Bezier curves, where each element is [first-point, control-point-1, control-point-2, second-point] and points are [x, y]
 */
function fitCubic(
  points: Points,
  leftTangent: Point,
  rightTangent: Point,
  error: number
): ReadonlyArray<Curve> {
  const MaxIterations = 20; //Max times to try iterating (to find an acceptable curve)

  //Use heuristic if region only has two points in it
  if (points.length === 2) {
    const dist = distance(points[0], points[1]) / 3;
    return [
      [
        points[0],
        add(points[0], scalarMul(leftTangent, dist)),
        add(points[1], scalarMul(rightTangent, dist)),
        points[1],
      ],
    ];
  }

  //Parameterize points, and attempt to fit curve
  const u = chordLengthParameterize(points);
  let [bezCurve, maxError, splitPoint] = generateAndReport(points, u, u, leftTangent, rightTangent);

  if (maxError === 0 || maxError < error) {
    return [bezCurve];
  }
  //If error not too large, try some reparameterization and iteration
  if (maxError < error * error) {
    let uPrime = u;
    let prevErr = maxError;
    let prevSplit = splitPoint;

    for (let i = 0; i < MaxIterations; i++) {
      uPrime = reparameterize(bezCurve, points, uPrime);
      [bezCurve, maxError, splitPoint] = generateAndReport(
        points,
        u,
        uPrime,
        leftTangent,
        rightTangent
      );

      if (maxError < error) return [bezCurve];
      //If the development of the fitted curve grinds to a halt,
      //we abort this attempt (and try a shorter curve):
      else if (splitPoint === prevSplit) {
        const errChange = maxError / prevErr;
        if (errChange > 0.9999 && errChange < 1.0001) {
          break;
        }
      }

      prevErr = maxError;
      prevSplit = splitPoint;
    }
  }

  //Fitting failed -- split at max error point and fit recursively
  const beziers: Array<Curve> = [];

  //To create a smooth transition from one curve segment to the next, we
  //calculate the line between the points directly before and after the
  //center, and use that as the tangent both to and from the center point.
  let centerVector = sub(points[splitPoint - 1], points[splitPoint + 1]);
  //However, this won't work if they're the same point, because the line we
  //want to use as a tangent would be 0. Instead, we calculate the line from
  //that "double-point" to the center point, and use its tangent.
  if (centerVector.x === 0 && centerVector.y === 0) {
    //[x,y] -> [-y,x]: http://stackoverflow.com/a/4780141/1869660
    const { x, y } = sub(points[splitPoint - 1], points[splitPoint]);
    centerVector = { x: -y, y: x };
  }
  const toCenterTangent = normalize(centerVector);
  //To and from need to point in opposite directions:
  const fromCenterTangent = scalarMul(toCenterTangent, -1);

  /*
    Note: An alternative to this "divide and conquer" recursion could be to always
          let new curve segments start by trying to go all the way to the end,
          instead of only to the end of the current subdivided polyline.
          That might let many segments fit a few points more, reducing the number of total segments.

          However, a few tests have shown that the segment reduction is insignificant
          (240 pts, 100 err: 25 curves vs 27 curves. 140 pts, 100 err: 17 curves on both),
          and the results take twice as many steps and milliseconds to finish,
          without looking any better than what we already have.
    */
  beziers.push(...fitCubic(points.slice(0, splitPoint + 1), leftTangent, toCenterTangent, error));
  beziers.push(...fitCubic(points.slice(splitPoint), fromCenterTangent, rightTangent, error));
  return beziers;
}

function generateAndReport(
  points: Points,
  paramsOrig: number[],
  paramsPrime: number[],
  leftTangent: Point,
  rightTangent: Point
): [Curve, number, number] {
  const bezCurve = generateBezier(points, paramsPrime, leftTangent, rightTangent);
  //Find max deviation of points to fitted curve.
  //Here we always use the original parameters (from chordLengthParameterize()),
  //because we need to compare the current curve to the actual source polyline,
  //and not the currently iterated parameters which reparameterize() & generateBezier() use,
  //as those have probably drifted far away and may no longer be in ascending order.
  const [maxError, splitPoint] = computeMaxError(points, bezCurve, paramsOrig);

  return [bezCurve, maxError, splitPoint];
}

/**
 * Use least-squares method to find Bezier control points for region.
 *
 * @param {Array<Array<Number>>} points - Array of digitized points
 * @param {Array<Number>} parameters - Parameter values for region
 * @param {Array<Number>} leftTangent - Unit tangent vector at start point
 * @param {Array<Number>} rightTangent - Unit tangent vector at end point
 * @returns {Array<Array<Number>>} Approximated Bezier curve: [first-point, control-point-1, control-point-2, second-point] where points are [x, y]
 */
function generateBezier(
  points: Points,
  parameters: number[],
  leftTangent: Point,
  rightTangent: Point
): Curve {
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  const bezCurve: Curve = [firstPoint, zeroPoint, zeroPoint, lastPoint];

  //Compute the A's
  const A = parameters.map(u => {
    const ux = 1 - u;
    return [
      scalarMul(leftTangent, 3 * u * (ux * ux)),
      scalarMul(rightTangent, 3 * ux * (u * u)),
    ] as const;
  });

  //Create the C and X matrices
  const C = [
    [0, 0],
    [0, 0],
  ];
  const X = [0, 0];
  for (const [i, u] of parameters.entries()) {
    const [a, b] = A[i];
    C[0][0] += dot(a, a);
    C[0][1] += dot(a, b);
    C[1][0] += dot(a, b);
    C[1][1] += dot(b, b);

    const tmp = sub(points[i], bezierQ([firstPoint, firstPoint, lastPoint, lastPoint], u));
    X[0] += dot(a, tmp);
    X[1] += dot(b, tmp);
  }

  //Compute the determinants of C and X
  const det_C0_C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const det_C0_X = C[0][0] * X[1] - C[1][0] * X[0];
  const det_X_C1 = X[0] * C[1][1] - X[1] * C[0][1];

  //Finally, derive alpha values
  const alpha_l = det_C0_C1 === 0 ? 0 : det_X_C1 / det_C0_C1;
  const alpha_r = det_C0_C1 === 0 ? 0 : det_C0_X / det_C0_C1;

  //If alpha negative, use the Wu/Barsky heuristic (see text).
  //If alpha is 0, you get coincident control points that lead to
  //divide by zero in any subsequent NewtonRaphsonRootFind() call.
  const segLength = norm(sub(firstPoint, lastPoint));
  const epsilon = 1.0e-6 * segLength;
  if (alpha_l < epsilon || alpha_r < epsilon) {
    //Fall back on standard (probably inaccurate) formula, and subdivide further if needed.
    bezCurve[1] = add(firstPoint, scalarMul(leftTangent, segLength / 3.0));
    bezCurve[2] = add(lastPoint, scalarMul(rightTangent, segLength / 3.0));
  } else {
    //First and last control points of the Bezier curve are
    //positioned exactly at the first and last data points
    //Control points 1 and 2 are positioned an alpha distance out
    //on the tangent vectors, left and right, respectively
    bezCurve[1] = add(firstPoint, scalarMul(leftTangent, alpha_l));
    bezCurve[2] = add(lastPoint, scalarMul(rightTangent, alpha_r));
  }

  return bezCurve;
}

/**
 * Given set of points and their parameterization, try to find a better parameterization.
 *
 * @param {Array<Array<Number>>} bezier - Current fitted curve
 * @param {Array<Array<Number>>} points - Array of digitized points
 * @param {Array<Number>} parameters - Current parameter values
 * @returns {Array<Number>} New parameter values
 */
function reparameterize(bezier: Curve, points: Points, parameters: number[]): number[] {
  return parameters.map((p, i) => newtonRaphsonRootFind(bezier, points[i], p));
}

/**
 * Use Newton-Raphson iteration to find better root.
 *
 * @param {Array<Array<Number>>} bez - Current fitted curve
 * @param {Array<Number>} point - Digitized point
 * @param {Number} u - Parameter value for "P"
 * @returns {Number} New u
 */
function newtonRaphsonRootFind(bez: Curve, point: Point, u: number): number {
  /*
        Newton's root finding algorithm calculates f(x)=0 by reiterating
        x_n+1 = x_n - f(x_n)/f'(x_n)
        We are trying to find curve parameter u for some point p that minimizes
        the distance from that point to the curve. Distance point to curve is d=q(u)-p.
        At minimum distance the point is perpendicular to the curve.
        We are solving
        f = q(u)-p * q'(u) = 0
        with
        f' = q'(u) * q'(u) + q(u)-p * q''(u)
        gives
        u_n+1 = u_n - |q(u_n)-p * q'(u_n)| / |q'(u_n)**2 + q(u_n)-p * q''(u_n)|
    */

  const d = sub(bezierQ(bez, u), point);
  const qprime = bezierQPrime(bez, u);
  const numerator = dot(d, qprime);
  const denominator = squaredNorm(qprime) + 2 * dot(d, bezierQPrimePrime(bez, u));

  if (denominator === 0) {
    return u;
  } else {
    return u - numerator / denominator;
  }
}

/**
 * Assign parameter values to digitized points using relative distances between points.
 *
 * @param {Array<Array<Number>>} points - Array of digitized points
 * @returns {Array<Number>} Parameter values
 */
function chordLengthParameterize(points: Points): number[] {
  let u: number[] = [];
  let currU: number;
  let prevU: number;
  let prevP: Point;

  points.forEach((p, i) => {
    currU = i > 0 ? prevU + norm(sub(p, prevP)) : 0;
    u.push(currU);

    prevU = currU;
    prevP = p;
  });
  u = u.map(x => x / prevU);

  return u;
}

/**
 * Find the maximum squared distance of digitized points to fitted curve.
 *
 * @param {Array<Array<Number>>} points - Array of digitized points
 * @param {Array<Array<Number>>} bez - Fitted curve
 * @param {Array<Number>} parameters - Parameterization of points
 * @returns {Array<Number>} Maximum error (squared) and point of max error
 */
function computeMaxError(points: Points, bez: Curve, parameters: number[]): [number, number] {
  // maximum error
  let maxDist = 0;
  // index of point with maximum error
  let splitPoint = Math.floor(points.length / 2);

  const t_distMap = mapTtoRelativeDistances(bez, 10);

  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    //Find 't' for a point on the bez curve that's as close to 'point' as possible:
    const t = find_t(bez, parameters[i], t_distMap, 10);

    // vector from point to curve
    const v = sub(bezierQ(bez, t), point);
    // current error
    const dist = squaredNorm(v);

    if (dist > maxDist) {
      maxDist = dist;
      splitPoint = i;
    }
  }

  return [maxDist, splitPoint];
}

//Sample 't's and map them to relative distances along the curve:
function mapTtoRelativeDistances(bez: Curve, B_parts: number): number[] {
  let B_t_dist = [0];
  let B_t_prev = bez[0];
  let sumLen = 0;

  for (let i = 1; i <= B_parts; i++) {
    const B_t_curr = bezierQ(bez, i / B_parts);

    sumLen += norm(sub(B_t_curr, B_t_prev));

    B_t_dist.push(sumLen);
    B_t_prev = B_t_curr;
  }

  //Normalize B_length to the same interval as the parameter distances; 0 to 1:
  B_t_dist = B_t_dist.map(x => x / sumLen);
  return B_t_dist;
}

function find_t(_bez: Curve, param: number, t_distMap: number[], B_parts: number): number {
  if (param < 0) {
    return 0;
  }
  if (param > 1) {
    return 1;
  }

  /*
        'param' is a value between 0 and 1 telling us the relative position
        of a point on the source polyline (linearly from the start (0) to the end (1)).
        To see if a given curve - 'bez' - is a close approximation of the polyline,
        we compare such a poly-point to the point on the curve that's the same
        relative distance along the curve's length.

        But finding that curve-point takes a little work:
        There is a function "B(t)" to find points along a curve from the parametric parameter 't'
        (also relative from 0 to 1: http://stackoverflow.com/a/32841764/1869660
                                    http://pomax.github.io/bezierinfo/#explanation),
        but 't' isn't linear by length (http://gamedev.stackexchange.com/questions/105230).

        So, we sample some points along the curve using a handful of values for 't'.
        Then, we calculate the length between those samples via plain euclidean distance;
        B(t) concentrates the points around sharp turns, so this should give us a good-enough outline of the curve.
        Thus, for a given relative distance ('param'), we can now find an upper and lower value
        for the corresponding 't' by searching through those sampled distances.
        Finally, we just use linear interpolation to find a better value for the exact 't'.

        More info:
            http://gamedev.stackexchange.com/questions/105230/points-evenly-spaced-along-a-bezier-curve
            http://stackoverflow.com/questions/29438398/cheap-way-of-calculating-cubic-bezier-length
            http://steve.hollasch.net/cgindex/curves/cbezarclen.html
            https://github.com/retuxx/tinyspline
    */

  //Find the two t-s that the current param distance lies between,
  //and then interpolate a somewhat accurate value for the exact t:
  for (let i = 1; i <= B_parts; i++) {
    if (param <= t_distMap[i]) {
      const tMin = (i - 1) / B_parts;
      const tMax = i / B_parts;
      const lenMin = t_distMap[i - 1];
      const lenMax = t_distMap[i];

      return ((param - lenMin) / (lenMax - lenMin)) * (tMax - tMin) + tMin;
    }
  }

  return Number.NaN;
}

/**
 * Creates a vector of length 1 which shows the direction from B to A
 */
function createTangent(pointA: Point, pointB: Point): Point {
  return normalize(sub(pointA, pointB));
}

//Evaluates cubic bezier at t, return point
function bezierQ(ctrlPoly: Curve, t: number): Point {
  const tx = 1.0 - t;
  const pA = scalarMul(ctrlPoly[0], tx ** 3);
  const pB = scalarMul(ctrlPoly[1], 3 * tx ** 2 * t);
  const pC = scalarMul(ctrlPoly[2], 3 * tx * t ** 2);
  const pD = scalarMul(ctrlPoly[3], t ** 3);
  return addN(pA, pB, pC, pD);
}

//Evaluates cubic bezier first derivative at t, return point
function bezierQPrime(ctrlPoly: Curve, t: number): Point {
  const tx = 1.0 - t;
  const pA = scalarMul(sub(ctrlPoly[1], ctrlPoly[0]), 3 * tx ** 2);
  const pB = scalarMul(sub(ctrlPoly[2], ctrlPoly[1]), 6 * tx * t);
  const pC = scalarMul(sub(ctrlPoly[3], ctrlPoly[2]), 3 * t ** 2);
  return addN(pA, pB, pC);
}

//Evaluates cubic bezier second derivative at t, return point
function bezierQPrimePrime(ctrlPoly: Curve, t: number): Point {
  return add(
    scalarMul(add(sub(ctrlPoly[2], scalarMul(ctrlPoly[1], 2)), ctrlPoly[0]), 6 * (1.0 - t)),
    scalarMul(add(sub(ctrlPoly[3], scalarMul(ctrlPoly[2], 2)), ctrlPoly[1]), 6 * t)
  );
}
