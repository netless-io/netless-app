import { ensureAttributes } from "@netless/app-shared";
import type { NetlessApp } from "@netless/window-manager";
import type { AppProxy } from "@netless/window-manager/dist/AppProxy";
import Emittery from "emittery";
import { SideEffectManager } from "side-effect-manager";
import type { Event, RoomState } from "white-web-sdk";
import styles from "./style.scss?inline";

function times(page: number): { name: string }[] {
  return Array(page)
    .fill(0)
    .map((_, i) => ({ name: String(i + 1) }));
}

function createIframe(): HTMLIFrameElement {
  return document.createElement("iframe");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createView(): HTMLDivElement {
  const div = document.createElement("div");
  div.classList.add("netless-app-iframe-bridge-view");
  return div;
}

function createMask(...el: HTMLElement[]): HTMLDivElement {
  const div = document.createElement("div");
  div.title = "Netless App Iframe Bridge";
  div.classList.add("netless-app-iframe-bridge");
  div.append(...el);
  return div;
}

export enum IframeEvents {
  Init = "Init",
  AttributesUpdate = "AttributesUpdate",
  SetAttributes = "SetAttributes",
  RegisterMagixEvent = "RegisterMagixEvent",
  RemoveMagixEvent = "RemoveMagixEvent",
  RemoveAllMagixEvent = "RemoveAllMagixEvent",
  RoomStateChanged = "RoomStateChanged",
  DispatchMagixEvent = "DispatchMagixEvent",
  ReceiveMagixEvent = "ReciveMagixEvent",
  NextPage = "NextPage",
  PrevPage = "PrevPage",
  SDKCreate = "SDKCreate",
  OnCreate = "OnCreate",
  SetPage = "SetPage",
  GetAttributes = "GetAttributes",
  Ready = "Ready",
  Destroy = "Destory",
  StartCreate = "StartCreate",
  WrapperDidUpdate = "WrapperDidUpdate",
  DisplayIframe = "DisplayIframe",
  HideIframe = "HideIframe",
  PageTo = "PageTo",
}

export enum DomEvents {
  WrapperDidMount = "WrapperDidMount",
  IframeLoad = "IframeLoad",
}

export interface Attributes {
  /** iframe src */
  src: string;
  /** must exist */
  displaySceneDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastEvent: { name: string; payload: any } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  debug: boolean;
}

const IframeBridge: NetlessApp<Attributes> = {
  kind: "IframeBridge",
  setup(context) {
    const box = context.getBox();
    const displayer = context.getDisplayer();
    const room = context.getRoom();

    const attrs = ensureAttributes(context, {
      src: "about:blank",
      displaySceneDir: "/h5",
      lastEvent: null,
      state: {},
      debug: import.meta.env.DEV,
    });

    box.mountStyles(styles);

    const iframe = createIframe();
    // const viewEl = createView();
    const wrapper = createMask(iframe);
    // hack on pointer events only if we have scenes
    if (context.getInitScenePath()) {
      wrapper.classList.add("readonly");
    }
    box.mountContent(wrapper);
    // context.mountView(viewEl);

    const currentIndex = () => displayer.state.sceneState.index;
    const currentPage = () => currentIndex() + 1;
    const totalPage = () => displayer.state.sceneState.scenes.length;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withReadonlyAttributes = (state: Record<string, any>) => ({
      ...state,
      // for backward compatibility
      url: attrs.src,
      displaySceneDir: attrs.displaySceneDir,
      width: iframe.scrollWidth,
      height: iframe.scrollHeight,
      useClicker: true,
      lastEvent: attrs.lastEvent,
    });

    const sideEffect = new SideEffectManager();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emitter = new Emittery<Record<IframeEvents | DomEvents, any>>();
    const magixEventMap = new Map<string, (event: Event) => void>();

    const removeAllMagixEvent = () => {
      magixEventMap.forEach((listener, event) => {
        displayer.removeMagixEventListener(event, listener);
      });
      magixEventMap.clear();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log = (...args: any) => attrs.debug && console.log(...args);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postMessage = (message: { kind: IframeEvents; payload: any }) => {
      log("[IframeBridge] postMessage %s %O", message.kind, message.payload);
      iframe.contentWindow?.postMessage(JSON.parse(JSON.stringify(message)), "*");
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          currentPage: currentPage(),
          observerId: displayer.observerId,
        },
      });
    };

    const onLoad = (ev: globalThis.Event): void => {
      sendInitMessage();
      emitter.emit(DomEvents.IframeLoad, ev);
      emitter.on(IframeEvents.Ready, () => {
        postMessage(attrs.lastEvent?.payload);
      });
      iframe.removeEventListener("load", onLoad);
    };
    sideEffect.addEventListener(iframe, "load", onLoad);

    let retryCount = 0;
    const onError = (): void => {
      // try again
      if (retryCount++ < 3) {
        iframe.src = attrs.src;
      }
    };
    sideEffect.addEventListener(iframe, "error", onError);

    iframe.src = attrs.src;

    sideEffect.add(() =>
      context.mobxUtils.autorun(() => {
        postMessage({
          kind: IframeEvents.AttributesUpdate,
          payload: withReadonlyAttributes(attrs.state),
        });
      })
    );
    sideEffect.add(() =>
      context.mobxUtils.autorun(() => {
        iframe.src = attrs.src;
      })
    );

    const bridge = {
      emitter,
      postMessage,
      context,
    };

    emitter.emit(IframeEvents.StartCreate);
    emitter.emit(IframeEvents.OnCreate, bridge);

    const onStateChange = (state: Partial<RoomState>) => {
      log("[IframeBridge] onStateChange", JSON.parse(JSON.stringify(state?.sceneState) || "{}"));
      if (state?.sceneState?.scenePath.startsWith(attrs.displaySceneDir)) {
        wrapper.classList.remove("readonly");
        log("[IframeBridge] onStateChange sent");
        postMessage({ kind: IframeEvents.RoomStateChanged, payload: state });
      } else {
        wrapper.classList.add("readonly");
        log("[IframeBridge] onStateChange dropped");
      }
    };
    sideEffect.add(() => {
      const callbackName = room ? "onRoomStateChanged" : "onPlayerStateChanged";
      displayer.callbacks.on(callbackName, onStateChange);
      return () => displayer.callbacks.off(callbackName, onStateChange);
    });

    // TODO: replace this with setScenes()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const appProxy = (context as any).manager.appProxies.get(context.appId) as AppProxy;

    sideEffect.addEventListener(window, "message", (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: { kind: IframeEvents; payload: any } = ev.data;
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            const nextPage = currentPage() + 1;
            if (nextPage > totalPage()) {
              break;
            }
            log("[IframeBridge] setSceneIndex", nextPage - 1);
            room.setSceneIndex(nextPage - 1);
            dispatchMagixEvent(IframeEvents.NextPage, {});
          }
          break;
        }
        case IframeEvents.PrevPage: {
          if (context.getIsWritable() && room) {
            const prevPage = currentPage() - 1;
            if (prevPage < 0) {
              return;
            }
            log("[IframeBridge] setSceneIndex", prevPage - 1);
            room.setSceneIndex(prevPage - 1);
            dispatchMagixEvent(IframeEvents.PrevPage, {});
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
        case IframeEvents.SetPage: {
          const page = data.payload;
          const nextScenes = times(page);
          if (context.getIsWritable() && room) {
            const scenes = room.entireScenes()[attrs.displaySceneDir];
            if (!scenes || scenes.length !== page) {
              room.putScenes(attrs.displaySceneDir, nextScenes);
            }
            room.setScenePath(attrs.displaySceneDir);
          }
          if (appProxy.scenes?.length !== nextScenes.length) {
            appProxy.scenes = nextScenes;
          }
          break;
        }
        case IframeEvents.PageTo: {
          if (context.getIsWritable() && room) {
            const page = data.payload as number;
            if (!Number.isSafeInteger(page) || page <= 0) {
              break;
            }
            room.setSceneIndex(page - 1);
            dispatchMagixEvent(IframeEvents.PageTo, page - 1);
          }
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
      sideEffect.flushAll();
      removeAllMagixEvent();
      iframe.remove();
    });

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).iframeBridge = bridge;
    }

    return bridge;
  },
};

export default IframeBridge;
