import type { Slide, SLIDE_EVENTS, SyncEvent } from "@netless/slide";

export type SlideState = Slide["slideState"];

export interface Attributes {
  /** convert task id */
  taskId: string;
  /** base url of converted resources */
  url: string;
  /** internal state of slide, do not change */
  state: SlideState | null;
}

export type MagixPayload = {
  type: typeof SLIDE_EVENTS.syncDispatch;
  payload: SyncEvent;
};
