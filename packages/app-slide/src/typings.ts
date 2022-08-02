import type { ISlideRenderOptions, Slide, SLIDE_EVENTS, SyncEvent } from "@netless/slide";
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

export interface AppOptions extends ISlideRenderOptions {
  debug?: boolean;
}
