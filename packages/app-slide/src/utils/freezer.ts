import type { RegisterParams } from "@netless/window-manager";

export interface FreezableSlide {
  freeze: () => void;
  unfreeze: () => void;
}

export const FreezerLength = 2;

export const apps = {
  map: new Map<string, FreezableSlide>(),
  queue: [] as string[],
  validateQueue() {
    if (import.meta.env.DEV) {
      console.log("[Slide] freezer: validate", this.queue);
    }
    while (this.queue.length > FreezerLength) {
      const appId = this.queue.pop() as string;
      const slide = this.map.get(appId);
      if (slide) {
        if (import.meta.env.DEV) {
          console.log("[Slide] freezer: validate-freeze", appId, this.queue);
        }
        slide.freeze();
      }
    }
  },
  set(appId: string, slide: FreezableSlide) {
    if (import.meta.env.DEV) {
      console.log("[Slide] freezer: add", appId, this.queue);
    }
    this.map.set(appId, slide);
    if (!this.queue.includes(appId)) {
      this.queue.unshift(appId);
    }
    this.validateQueue();
  },
  delete(appId: string) {
    if (import.meta.env.DEV) {
      console.log("[Slide] freezer: delete", appId, this.queue);
    }
    this.map.delete(appId);
    this.queue = this.queue.filter(id => id !== appId);
  },
  focus(appId: string) {
    const slide = this.map.get(appId);
    const index = this.queue.indexOf(appId);
    if (index > -1) {
      this.queue.splice(index, 1);
    }
    this.queue.unshift(appId);
    this.validateQueue();
    if (import.meta.env.DEV) {
      console.log("[Slide] freezer: focus", appId, this.queue);
    }
    if (slide) {
      slide.unfreeze();
    }
  },
};

if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).freezer = apps;
}

export type AddHooks = NonNullable<RegisterParams["addHooks"]>;

/**
 * Put this function in your register code:
 * `WindowManager.register({ addHooks })`
 * So that it will automatically freeze the app when it is not in focus.
 */
export const addHooks: AddHooks = emitter => {
  emitter.on("focus", ({ appId }) => {
    apps.focus(appId);
  });
};
