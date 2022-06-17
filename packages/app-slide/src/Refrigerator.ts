import type { SlideViewer } from "./SlideViewer";
import type { AddHooks } from "./typings";

export class Refrigerator {
  threshold = 2;

  private _map = new Map<string, SlideViewer>();
  private _queue: string[] = [];

  set(appId: string, viewer: SlideViewer) {
    this._map.set(appId, viewer);
    if (!this._queue.includes(appId)) {
      this._queue.unshift(appId);
    }
    this._refresh();
    return () => {
      this.delete(appId);
    };
  }

  delete(appId: string) {
    this._map.delete(appId);
    this._queue = this._queue.filter(id => id !== appId);
    this._refresh();
  }

  focus(appId: string) {
    const index = this._queue.indexOf(appId);
    if (index >= 0) {
      this._queue.splice(index, 1);
    }
    this._queue.unshift(appId);
    this._refresh();
  }

  private _refresh() {
    let viewer: SlideViewer | undefined;
    this._queue.forEach((appId, i) => {
      if (!(viewer = this._map.get(appId))) return;
      if (i < this.threshold) {
        viewer.unfreeze();
      } else {
        viewer.freeze();
      }
    });
    if (import.meta.env.DEV) {
      console.log(
        "[Slide] refrigerator._refresh",
        `[${this._queue.slice(0, this.threshold)}]`,
        `[${this._queue.slice(this.threshold)}]`
      );
    }
  }
}

export const refrigerator = new Refrigerator();
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).refrigerator = refrigerator;
}

export const addHooks: AddHooks = function addHooks(emitter) {
  emitter.on("focus", event => {
    refrigerator.focus(event.appId);
  });
};
