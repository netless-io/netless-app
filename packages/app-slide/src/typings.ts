import type { CustomLink, Slide, SLIDE_EVENTS, SyncEvent } from "@netless/slide";

export type SlideState = Slide["slideState"];

/** One authoritative volume per PPT app instance; absent in legacy rooms. */
export interface SharedMediaVolume {
  value: number;
  changeId: string;
  taskId: string;
  url: string;
}

export function isMediaVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function readSharedMediaVolume(
  record: SharedMediaVolume | undefined,
  taskId: string,
  url: string
): number | undefined {
  return record &&
    typeof record.changeId === "string" &&
    record.changeId.length > 0 &&
    record.taskId === taskId &&
    record.url === url &&
    isMediaVolume(record.value)
    ? record.value
    : undefined;
}

export interface Attributes {
  /** convert task id */
  taskId: string;
  /** base url of converted resources */
  url: string;
  /** internal state of slide, do not change */
  state: SlideState | null;
  /** Optional, opt-in shared volume authority. Never initialized merely by opening a room. */
  sharedMediaVolume?: SharedMediaVolume;
  resourceList: string[];
  previewList: string[];
  customLinks: CustomLink[];
  slideScale: number;
  translateX: number;
  translateY: number;
  originSize: {
    width: number;
    height: number;
  } | null;
}

export type MagixPayload = {
  type: typeof SLIDE_EVENTS.syncDispatch;
  payload: SyncEvent;
};

export type MagixEvents = {
  [SLIDE_EVENTS.syncDispatch]: MagixPayload;
};
