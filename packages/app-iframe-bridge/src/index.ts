/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureAttributes } from "@netless/app-shared";
import type { NetlessApp } from "@netless/window-manager";
import Emittery from "emittery";
import { SideEffectManager } from "side-effect-manager";
import type { AnimationMode, ApplianceNames, Event, RoomState } from "white-web-sdk";
import { fakeRoomStateChanged, nextPage, pageToScenes, prevPage } from "./page";
import { height } from "./hardcode";
import { DomEvents, IframeEvents } from "./typings";

export interface Attributes {
  src: string;
  displaySceneDir: string;
  lastEvent: { name: string; payload: unknown } | null;
  state: Record<string, unknown>;
  page: number;
  maxPage: number;
}

const ClickThroughAppliances = new Set(["clicker", "selector"]);

const IframeBridge: NetlessApp<Attributes> = {
  kind: "IframeBridge",
  setup(context) {
    const box = context.getBox();
    const view = context.getView();
    const displayer = context.getDisplayer();
    const room = context.getRoom();

    const attrs = ensureAttributes(context, {
      src: "about:blank",
      displaySceneDir: "/h5",
      lastEvent: null,
      state: {},
      page: 0,
      maxPage: 0,
    });

    const sideEffectManager = new SideEffectManager();

    const container = document.createElement("div");
    Object.assign(container.style, { width: "100%", height: "100%", position: "relative" });

    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, {
      width: "100%",
      height: "100%",
      border: "none",
      display: "block",
    });
    container.appendChild(iframe);

    box.mountContent(container);

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    let toggleClickThrough: (enable?: boolean) => void = () => {};
    const shouldClickThrough = (tool?: ApplianceNames) => {
      return ClickThroughAppliances.has(tool as ApplianceNames);
    };

    if (view) {
      const viewBox = document.createElement("div");
      Object.assign(viewBox.style, {
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        overflow: "hidden",
      });
      container.appendChild(viewBox);
      context.mountView(viewBox);

      view.disableCameraTransform = true;
      sideEffectManager.add(() => {
        const onResize = () => {
          const clientRect = container.getBoundingClientRect();
          const scale = clientRect.height / height;
          view.moveCamera({ scale, animationMode: "immediately" as AnimationMode });
        };
        const observer = new ResizeObserver(onResize);
        observer.observe(container);
        return () => observer.disconnect();
      });

      toggleClickThrough = (enable?: boolean) => {
        viewBox.style.pointerEvents = enable ? "none" : "auto";
      };

      toggleClickThrough(shouldClickThrough(room?.state.memberState.currentApplianceName));
    }

    const withReadonlyAttributes = (state: Record<string, unknown>) => ({
      ...state,
      // for backward compatibility
      url: attrs.src,
      displaySceneDir: attrs.displaySceneDir,
      width: iframe.scrollWidth,
      height: iframe.scrollHeight,
      useClicker: true,
      lastEvent: attrs.lastEvent,
    });

    const emitter = new Emittery<Record<IframeEvents | DomEvents, any>>();
    const magixEventMap = new Map<string, (event: Event) => void>();

    const removeAllMagixEvent = () => {
      magixEventMap.forEach((listener, event) => {
        displayer.removeMagixEventListener(event, listener);
      });
      magixEventMap.clear();
    };

    const log = (...args: any) => import.meta.env.DEV && console.log(...args);

    const postMessage = (message: { kind: IframeEvents; payload: any }) => {
      log("[IframeBridge] postMessage %s %O", message.kind, message.payload);
      iframe.contentWindow?.postMessage(JSON.parse(JSON.stringify(message)), "*");
    };

    const dispatchMagixEvent = (event: string, payload: any) => {
      if (context.getIsWritable()) {
        context.updateAttributes(["lastEvent"], { name: event, payload });
        log("[IframeBridge] dispatchMagixEvent %s %O", event, payload);
        room?.dispatchMagixEvent(event, payload);
      }
    };

    const sendInitMessage = () => {
      postMessage({
        kind: IframeEvents.Init,
        payload: {
          attributes: withReadonlyAttributes(attrs.state),
          roomState: displayer.state,
          currentPage: attrs.page,
          observerId: displayer.observerId,
        },
      });
    };

    let hackCocos = attrs.src.includes("cocos");

    const onLoad = (ev: globalThis.Event): void => {
      sendInitMessage();
      emitter.emit(DomEvents.IframeLoad, ev);
      emitter.on(IframeEvents.Ready, () => {
        if (attrs.lastEvent?.payload) {
          postMessage(attrs.lastEvent?.payload as { kind: IframeEvents; payload: any });
        }
      });
      if (hackCocos) {
        setTimeout(() => {
          postMessage({
            kind: IframeEvents.RoomStateChanged,
            payload: fakeRoomStateChanged(1, attrs.maxPage, attrs.displaySceneDir),
          });
        }, 500);
        hackCocos = false;
      }
      iframe.removeEventListener("load", onLoad);
    };
    sideEffectManager.addEventListener(iframe, "load", onLoad);

    let retryCount = 0;
    const onError = (): void => {
      // try again
      if (retryCount++ < 3) {
        iframe.src = attrs.src;
      }
    };
    sideEffectManager.addEventListener(iframe, "error", onError);

    iframe.src = attrs.src;

    sideEffectManager.add(() =>
      context.mobxUtils.autorun(() => {
        postMessage({
          kind: IframeEvents.AttributesUpdate,
          payload: withReadonlyAttributes(attrs.state),
        });
      })
    );
    sideEffectManager.add(() =>
      context.mobxUtils.autorun(() => {
        iframe.src = attrs.src;
      })
    );

    sideEffectManager.add(() =>
      context.mobxUtils.autorun(() => {
        postMessage({
          kind: IframeEvents.RoomStateChanged,
          payload: fakeRoomStateChanged(attrs.page, attrs.maxPage, attrs.displaySceneDir),
        });
      })
    );

    const bridge = {
      emitter,
      postMessage,
      context,
    };

    emitter.emit(IframeEvents.StartCreate);
    emitter.emit(IframeEvents.OnCreate, bridge);

    if (room) {
      sideEffectManager.add(() => {
        const onRoomStateChanged = (e: Partial<RoomState>) => {
          if (e.memberState) {
            toggleClickThrough(shouldClickThrough(e.memberState.currentApplianceName));
          }
        };
        room.callbacks.on("onRoomStateChanged", onRoomStateChanged);
        return () => room.callbacks.off("onRoomStateChanged", onRoomStateChanged);
      });
    }

    sideEffectManager.addEventListener(window, "message", (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow) {
        return;
      }
      const data: { kind: IframeEvents; payload: any } = ev.data;
      log("[IframeBridge] received", data.kind, data.payload);
      switch (data.kind) {
        case IframeEvents.SetAttributes: {
          context.updateAttributes(["state"], { ...attrs.state, ...data.payload });
          break;
        }
        case IframeEvents.RegisterMagixEvent: {
          const listener = (ev: Event) => {
            if (ev.authorId === displayer.observerId) {
              return;
            }
            postMessage({ kind: IframeEvents.ReceiveMagixEvent, payload: ev });
          };
          const eventName = data.payload;
          magixEventMap.set(eventName, listener);
          displayer.addMagixEventListener(eventName, listener);
          break;
        }
        case IframeEvents.RemoveMagixEvent: {
          const eventName = data.payload;
          const listener = magixEventMap.get(eventName);
          displayer.removeMagixEventListener(eventName, listener);
          break;
        }
        case IframeEvents.DispatchMagixEvent: {
          const ev: { event: string; payload: any } = data.payload;
          dispatchMagixEvent(ev.event, ev.payload);
          break;
        }
        case IframeEvents.RemoveAllMagixEvent: {
          removeAllMagixEvent();
          break;
        }
        case IframeEvents.NextPage: {
          if (context.getIsWritable() && room) {
            const page = nextPage(attrs.page, attrs.maxPage);
            if (page === attrs.page) break;
            context.setScenePath([attrs.displaySceneDir, page].join("/"));
            context.updateAttributes(["page"], page);
            dispatchMagixEvent(IframeEvents.NextPage, {});
          }
          break;
        }
        case IframeEvents.PrevPage: {
          if (context.getIsWritable() && room) {
            const page = prevPage(attrs.page);
            if (page === attrs.page) break;
            context.setScenePath([attrs.displaySceneDir, page].join("/"));
            context.updateAttributes(["page"], page);
            dispatchMagixEvent(IframeEvents.PrevPage, {});
          }
          break;
        }
        case IframeEvents.SetPage: {
          const maxPage = Number(data.payload) || 0;
          if (context.getIsWritable() && room) {
            if (!maxPage) {
              room.removeScenes(attrs.displaySceneDir);
            } else {
              const scenes = room.entireScenes()[attrs.displaySceneDir];
              if (!scenes || scenes.length !== maxPage) {
                room.removeScenes(attrs.displaySceneDir);
                room.putScenes(attrs.displaySceneDir, pageToScenes(maxPage));
              }
              context.setScenePath(`${attrs.displaySceneDir}/1`);
              log("[IframeBridge] SetPage", maxPage);
              context.updateAttributes(["maxPage"], maxPage);
            }
          }
          break;
        }
        case IframeEvents.PageTo: {
          const page = data.payload as number;
          if (context.getIsWritable() && room) {
            if (!Number.isSafeInteger(page) || page <= 0) break;
            context.setScenePath(`${attrs.displaySceneDir}/${page}`);
            context.updateAttributes(["page"], page);
            dispatchMagixEvent(IframeEvents.PageTo, page - 1);
          }
          break;
        }
        case IframeEvents.SDKCreate: {
          sendInitMessage();
          break;
        }
        case IframeEvents.GetAttributes: {
          postMessage({
            kind: IframeEvents.GetAttributes,
            payload: withReadonlyAttributes(attrs.state),
          });
          break;
        }
        default: {
          console.warn(`[IframeBridge]: unknown event kind "${data.kind}"`);
        }
      }
    });

    context.emitter.on("destroy", () => {
      console.log("[IframeBridge]: destroy");
      emitter.emit(IframeEvents.Destroy);
      sideEffectManager.flushAll();
      removeAllMagixEvent();
      iframe.remove();
    });

    if (import.meta.env.DEV) {
      (window as any).iframeBridge = bridge;
    }

    return bridge;
  },
};

export default IframeBridge;
