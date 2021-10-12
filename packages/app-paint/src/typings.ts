export type PID = string;
export type Point = { x: number; y: number };
export type Curve = [Point, Point, Point, Point];
export type BroadcastEvent = { clear?: true; pid?: PID; point?: Point; done?: true };
