import type { Event } from "white-web-sdk";
import type { AppContext } from "@netless/window-manager";
import type { Disposer, ISyncService } from "./ggb/live";
import type { Attributes } from ".";

export function onResize<T extends HTMLElement>(
  target: T,
  callback: (element: T) => void
): () => void {
  const observer = new ResizeObserver(() => callback(target));
  observer.observe(target);
  return () => observer.disconnect();
}

export function createSyncService(
  context: AppContext<Attributes>,
  attributes: Attributes,
  key: keyof Attributes
): {
  service: ISyncService;
  disposer: Disposer;
} {
  const displayer = context.displayer;
  const room = context.room;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let listeners: Array<(payload: any) => void> = [];

  const onMessage = (event: Event) => {
    if (event.authorId !== displayer.observerId) {
      listeners.forEach(f => f(event.payload));
    }
  };

  const event = "sync--" + context.appId;
  displayer.addMagixEventListener(event, onMessage);

  const service: ISyncService = {
    addListener(listener) {
      listeners.push(listener);
    },
    postMessage(payload) {
      room?.dispatchMagixEvent(event, payload);
    },
    load() {
      return attributes[key];
    },
    save(value: string) {
      context.updateAttributes([key], value);
    },
  };

  const disposer = () => {
    listeners = [];
    displayer.removeMagixEventListener(event);
  };

  return { service, disposer };
}
