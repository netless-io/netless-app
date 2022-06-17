import type { Slide, SLIDE_EVENTS, SyncEvent } from "@netless/slide";
import type { RegisterParams } from "@netless/window-manager";

export type SlideState = Slide["slideState"];

export type AddHooks = NonNullable<RegisterParams["addHooks"]>;

export interface Attributes {
  /** convert task id */
  taskId: string;
  /** base url of converted resources, default `https://convertcdn.netless.link/dynamicConvert` */
  url: string;
  /** internal state of slide, do not change */
  state: SlideState | null;
}

export interface MagixEvents {
  [SLIDE_EVENTS.syncDispatch]: SyncEvent;
}

export interface AppOptions {
  /** show debug controller */
  debug?: boolean;
  /** scale */
  resolution?: number;
  /** background color for slide animations */
  bgColor?: string;
  /** minimal fps  (default: 25) */
  minFPS?: number;
  /** maximal fps  (default: 30) */
  maxFPS?: number;
  /** automatically decrease fps  (default: true) */
  autoFPS?: boolean;
  /** whether to re-scale automatically (default: true) */
  autoResolution?: boolean;
}
