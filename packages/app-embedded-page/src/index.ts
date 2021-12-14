import styles from "./style.scss?inline";

import type { NetlessApp } from "@netless/window-manager";
import type {
  AkkoObjectUpdatedListener,
  AnimationMode,
  ApplianceNames,
  Event,
  RoomState,
  ScenePathType,
  RoomMember as PlainRoomMember,
} from "white-web-sdk";

import { ensureAttributes, Logger } from "@netless/app-shared";
import { SideEffectManager } from "side-effect-manager";

import { isObj } from "./utils";
import type {
  FromSDKMessage,
  RoomMember,
  DefaultState,
  CameraState,
  PostToSDKMessage,
  AddFromSDKMessageListener,
} from "./types";

export * from "./types";

export type Attributes = {
  src: string;
  store: DefaultState;
  page: string;
};

export interface AppOptions<TState = DefaultState, TMessage = unknown> {
  debug?: boolean;
  postMessage?: PostToSDKMessage<TState, TMessage>;
  addMessageListener?: AddFromSDKMessageListener<TState, TMessage>;
}

const ClickThroughAppliances = new Set(["clicker", "selector"]);

const EmbeddedPage: NetlessApp<Attributes, void, AppOptions> = {
  kind: "EmbeddedPage",
  setup(context) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).EmbeddedPageContext = context;
    }

    const appOptions = context.getAppOptions() || {};

    const displayer = context.getDisplayer();
    const room = context.getRoom();
    const box = context.getBox();
    const view = context.getView();
    const debug = appOptions.debug;
    const mainStoreId = "state";

    const attrs = ensureAttributes<Attributes>(context, {
      src: "https://example.org",
      store: { [mainStoreId]: {} },
      page: "",
    });

    const sideEffectManager = new SideEffectManager();
    const logger = new Logger("EmbeddedPage", debug);

    const toJSON = <T = unknown>(o: unknown): T => {
      try {
        return isObj(o) ? JSON.parse(JSON.stringify(o)) : o;
      } catch (e) {
        logger.error("Cannot parse to JSON object", o);
        throw e;
      }
    };

    const container = document.createElement("div");
    container.dataset.appKind = "EmbeddedPage";
    container.classList.add("netless-app-embedded-page");

    const iframe = document.createElement("iframe");
    container.appendChild(iframe);

    box.mountStyles(styles);
    box.mountContent(container);

    const transformRoomMembers = (
      array: ReadonlyArray<PlainRoomMember>
    ): ReadonlyArray<RoomMember> =>
      array.map(({ memberId, payload }) => ({
        sessionUID: memberId,
        uid: payload?.uid || "",
        userPayload: toJSON(payload),
      }));

    const safeListenPropsUpdated = <T>(
      getProps: () => T,
      callback: AkkoObjectUpdatedListener<T>
    ) => {
      let disposeListenUpdated: (() => void) | null = null;
      const disposeReaction = context.mobxUtils.reaction(
        getProps,
        () => {
          if (disposeListenUpdated) {
            disposeListenUpdated();
            disposeListenUpdated = null;
          }
          const props = getProps();
          disposeListenUpdated = () => context.objectUtils.unlistenUpdated(props, callback);
          context.objectUtils.listenUpdated(props, callback);
        },
        { fireImmediately: true }
      );

      return () => {
        disposeListenUpdated?.();
        disposeReaction();
      };
    };

    const postMessage: PostToSDKMessage<DefaultState> =
      appOptions.postMessage ||
      (message => {
        logger.log("Message to SDK", message);
        iframe.contentWindow?.postMessage(message, "*");
      });

    const addMessageListener: AddFromSDKMessageListener<DefaultState> =
      appOptions.addMessageListener ||
      ((listener, options) => {
        const handler = ({ data, source }: MessageEvent<FromSDKMessage>) => {
          if (source !== iframe.contentWindow || !isObj(data) || !data.NEAType) {
            return;
          }
          logger.log("Message from SDK", data);
          listener(data);
        };

        window.addEventListener("message", handler, options);

        return () => {
          window.removeEventListener("message", handler, options);
        };
      });

    /* --------------------------------------------- *\
     # Whiteboard panel
    \* --------------------------------------------- */

    if (view) {
      // cover a whiteboard panel on top of the iframe
      const viewBox = document.createElement("div");
      viewBox.classList.add("netless-app-embedded-page-wb-view");
      container.appendChild(viewBox);
      context.mountView(viewBox);

      if (room) {
        const toggleClickThrough = (tool?: ApplianceNames) => {
          viewBox.style.pointerEvents = !tool || ClickThroughAppliances.has(tool) ? "none" : "auto";
        };

        toggleClickThrough(room.state.memberState.currentApplianceName);

        sideEffectManager.add(() => {
          const onRoomStateChanged = (e: Partial<RoomState>) => {
            if (e.memberState) {
              toggleClickThrough(e.memberState.currentApplianceName);
            }
          };
          displayer.callbacks.on("onRoomStateChanged", onRoomStateChanged);
          return () => displayer.callbacks.off("onRoomStateChanged", onRoomStateChanged);
        });
      }
    }

    const moveCamera = (config?: Partial<CameraState>): void => {
      if (view && isObj(config)) {
        view.moveCamera({
          centerX: config.x,
          centerY: config.y,
          scale: config.scale,
          animationMode: "immediately" as AnimationMode.Immediately,
        });
      }
    };

    /* --------------------------------------------- *\
     # App store
    \* --------------------------------------------- */

    const setStore = (payload: unknown): void => {
      if (isObj(payload)) {
        Object.keys(payload).forEach(id => {
          if (id !== mainStoreId) {
            const state = payload[id];
            context.updateAttributes(["store", id], state);
          }
        });
      }
    };

    const setState = (payload: unknown): void => {
      if (isObj(payload) && payload.storeId && isObj(payload.state)) {
        const { storeId, state } = payload as FromSDKMessage<"SetState", DefaultState>["payload"];
        if (!context.getIsWritable()) {
          logger.error(`Cannot setState on store ${storeId} without writable access`, state);
          return;
        }
        Object.keys(state).forEach(key => {
          context.updateAttributes(["store", storeId, key], state[key]);
        });
      }
    };

    sideEffectManager.add(() => {
      const storeSideEffect = new SideEffectManager();

      const listenStateUpdated = (storeId: string): void => {
        storeSideEffect.add(
          () =>
            safeListenPropsUpdated(
              () => attrs.store[storeId],
              actions => {
                postMessage({
                  NEAType: "StateChanged",
                  payload: { storeId, actions: toJSON(actions) },
                });
              }
            ),
          storeId
        );
      };

      Object.keys(attrs.store).forEach(listenStateUpdated);

      const disposer = safeListenPropsUpdated(
        () => attrs.store,
        actions => {
          postMessage({ NEAType: "StoreChanged", payload: toJSON(actions) });

          if (attrs.store) {
            actions.forEach(({ key, kind }) => {
              switch (kind) {
                case 2: {
                  storeSideEffect.flush(key);
                  break;
                }
                default: {
                  listenStateUpdated(key);
                  break;
                }
              }
            });
          }
        }
      );

      return () => {
        storeSideEffect.flushAll();
        disposer();
      };
    });

    /* --------------------------------------------- *\
     # Room Members State
    \* --------------------------------------------- */

    sideEffectManager.add(() => {
      const onRoomStateChanged = (e: Partial<RoomState>) => {
        if (e?.roomMembers) {
          postMessage({
            NEAType: "RoomMembersChanged",
            payload: transformRoomMembers(e.roomMembers),
          });
        }
      };
      displayer.callbacks.on("onRoomStateChanged", onRoomStateChanged);
      return () => displayer.callbacks.off("onRoomStateChanged", onRoomStateChanged);
    });

    /* --------------------------------------------- *\
     # Page State
    \* --------------------------------------------- */

    const setPage = (page: unknown): void => {
      if (!view) {
        logger.warn("SetPage: page api is only available with 'scenePath' options enabled.");
      } else {
        const scenePath = context.getInitScenePath();
        if (typeof page === "string" && context.getIsWritable() && scenePath && room) {
          const fullScenePath = [scenePath, page].join("/");
          if (room.scenePathType(fullScenePath) === ("none" as ScenePathType.None)) {
            room.putScenes(scenePath, [{ name: page }]);
          }
          context.setScenePath(fullScenePath);
          context.updateAttributes(["page"], page);
        }
      }
    };

    sideEffectManager.add(() => {
      const updateListener = (newValue: string, oldValue: string) => {
        postMessage({ NEAType: "PageChanged", payload: { oldValue, newValue } });
      };
      return context.mobxUtils.reaction(() => attrs.page, updateListener);
    });

    /* --------------------------------------------- *\
     # Writable State
    \* --------------------------------------------- */

    sideEffectManager.add(() => {
      const updateListener = () => {
        const isWritable = context.getIsWritable();
        postMessage({
          NEAType: "WritableChanged",
          payload: isWritable,
        });
        logger.log(`WritableChange changed to ${isWritable}`);
      };
      context.emitter.on("writableChange", updateListener);
      return () => context.emitter.off("writableChange", updateListener);
    });

    /* --------------------------------------------- *\
     # Magix Events
    \* --------------------------------------------- */

    const magixEventChannel = `channel-${context.appId}`;

    const sendMagixMessage = (message: unknown): void => {
      if (context.getIsWritable() && room) {
        room.dispatchMagixEvent(magixEventChannel, message);
      }
    };

    sideEffectManager.add(() => {
      // pass through magix events
      const magixListener = (e: Event) => {
        if (e.event === magixEventChannel && e.authorId !== displayer.observerId) {
          postMessage({ NEAType: "ReceiveMagixMessage", payload: e.payload });
        }
      };
      displayer.addMagixEventListener(magixEventChannel, magixListener);
      return () => displayer.removeMagixEventListener(magixEventChannel, magixListener);
    });

    /* --------------------------------------------- *\
     # Pass app data on init
    \* --------------------------------------------- */

    const sendInitData = () => {
      const memberId = displayer.observerId;
      const userPayload = displayer.state.roomMembers.find(
        member => member.memberId === memberId
      )?.payload;

      postMessage({
        NEAType: "Init",
        payload: {
          appId: context.appId,
          page: attrs.page,
          writable: context.getIsWritable(),
          roomMembers: transformRoomMembers(displayer.state.roomMembers),
          debug,
          store: toJSON(attrs.store),
          mainStoreId,
          meta: {
            sessionUID: memberId,
            uid: room?.uid || userPayload?.uid || "",
            roomUUID: room?.uuid,
            userPayload: toJSON(userPayload),
          },
        },
      });
    };

    /* --------------------------------------------- *\
     # Setup iframe message hub
    \* --------------------------------------------- */

    sideEffectManager.add(() =>
      addMessageListener(message => {
        switch (message.NEAType) {
          case "Init": {
            sendInitData();
            break;
          }
          case "SetState": {
            setState(message.payload);
            break;
          }
          case "SetStore": {
            setStore(message.payload);
            break;
          }
          case "SetPage": {
            setPage(message.payload);
            break;
          }
          case "SendMagixMessage": {
            sendMagixMessage(message.payload);
            break;
          }
          case "MoveCamera": {
            moveCamera(message.payload);
            break;
          }
        }
      })
    );

    context.emitter.on("destroy", () => {
      logger.log("destroy");
      sideEffectManager.flushAll();
    });

    // Load the iframe page
    iframe.src = attrs.src;
  },
};

export default EmbeddedPage;
