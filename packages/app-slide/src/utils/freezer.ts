import type { ReadonlyTeleBox, RegisterParams } from "@netless/window-manager";
import { log } from "./logger";

export interface FreezableSlide {
  freeze: () => void;
  unfreeze: () => void;
}

export let useFreezer = false;
export let FreezerLength = 2;

export function getFreezerLength() {
  return FreezerLength;
}

/** @param length - must be >= 1, default is 2 */
export function setFreezerLength(length: number) {
  FreezerLength = length < 1 ? Infinity : length;
}

const inspect = (arr: string[]) => {
  return "[" + arr + "]";
};

export const apps = {
  map: new Map<string, FreezableSlide>(),
  boxes: new Map<string, ReadonlyTeleBox>(),
  queue: [] as string[],
  validateQueue() {
    // queue = [5, 4, 3, 2, 1]
    this.queue.sort((a, b) => {
      const za = this.boxes.get(a)?.zIndex ?? 0;
      const zb = this.boxes.get(b)?.zIndex ?? 0;
      return -(za - zb);
    });
    log("[Slide] freezer: validate", inspect(this.queue));
    while (this.queue.length > FreezerLength) {
      const appId = this.queue.pop() as string;
      const slide = this.map.get(appId);
      if (slide) {
        log("[Slide] freezer: validate-freeze", appId, inspect(this.queue));
        slide.freeze();
      }
    }
  },
  set(appId: string, slide: FreezableSlide, box: ReadonlyTeleBox) {
    log("[Slide] freezer: add", appId, inspect(this.queue));
    this.map.set(appId, slide);
    this.boxes.set(appId, box);
    if (!this.queue.includes(appId)) {
      this.queue.unshift(appId);
    }
    this.validateQueue();
  },
  delete(appId: string) {
    this.map.delete(appId);
    this.boxes.delete(appId);
    this.queue = this.queue.filter(id => id !== appId);
    log("[Slide] freezer: delete", appId, inspect(this.queue));
  },
  focus(appId: string) {
    const slide = this.map.get(appId);
    const index = this.queue.indexOf(appId);
    if (index > -1) {
      this.queue.splice(index, 1);
    }
    this.queue.unshift(appId);
    this.validateQueue();
    log("[Slide] freezer: focus", appId, inspect(this.queue));
    if (slide) {
      slide.unfreeze();
    }
  },
};

if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).freezer = apps;
}

const on_created_callbacks = new Set<(appId: string) => void>();

export function onCreated(callback: (appId: string) => void) {
  on_created_callbacks.add(callback);
  return () => on_created_callbacks.delete(callback);
}

const on_destroyed_callbacks = new Set<(appId: string) => void>();

export function onDestroyed(callback: (appId: string) => void) {
  on_destroyed_callbacks.add(callback);
  return () => on_destroyed_callbacks.delete(callback);
}

export type AddHooks = NonNullable<RegisterParams["addHooks"]>;

/**
 * Put this function in your register code:
 * `WindowManager.register({ kind: 'Slide', src: SlideApp, addHooks })`
 * So that it will automatically freeze the app when it is not in focus.
 */
export const addHooks: AddHooks = emitter => {
  useFreezer = true;

  emitter.on("focus", ({ appId }) => {
    apps.focus(appId);
  });

  emitter.on("created", ({ appId }) => {
    on_created_callbacks.forEach(callback => callback(appId));
  });

  emitter.on("destroy", ({ appId }) => {
    on_destroyed_callbacks.forEach(callback => callback(appId));
  });
};
