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

import type {
  FromSDKMessage,
  RoomMember,
  ToSDKMessageKey,
  ToSDKMessage,
  DefaultState,
  CameraState,
} from "./types";
import { isObj } from "./utils";
import styles from "./style.scss?inline";

export * from "./types";

export interface Attributes {
  src: string;
  state: DefaultState;
  page: string;
}

export interface AppOptions {
  debug?: boolean;
}

const ClickThroughAppliances = new Set(["clicker", "selector"]);

const EmbeddedPage: NetlessApp<Attributes, void, AppOptions> = {
  kind: "EmbeddedPage",
  setup(context) {
    const displayer = context.getDisplayer();
    const room = context.getRoom();
    const box = context.getBox();
    const view = context.getView();
    const debug = import.meta.env.DEV || context.getAppOptions()?.debug;

    const attrs = ensureAttributes<Attributes>(context, {
      src: "https://example.org",
      state: {},
      page: "",
    });

    const sideEffectManager = new SideEffectManager();
    const logger = new Logger("EmbeddedPage", debug);

    const toJSON = <T = unknown>(o: T): T => {
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
        uid: room?.uid || payload?.uid || "",
        userPayload: toJSON(payload),
      }));

    const postMessage = <T extends ToSDKMessageKey>(message: ToSDKMessage<T>) => {
      logger.log("postMessage", message);
      iframe.contentWindow?.postMessage(message, "*");
    };

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
     # App State
    \* --------------------------------------------- */

    const setState = (state: unknown): void => {
      if (isObj(state) && context.getIsWritable()) {
        for (const [key, value] of Object.entries(state)) {
          context.updateAttributes(["state", key], value);
        }
      }
    };

    sideEffectManager.add(() => {
      const updateListener: AkkoObjectUpdatedListener<DefaultState> = updatedProperties => {
        postMessage({ type: "StateChanged", payload: toJSON(updatedProperties) });
      };
      const listen = () => context.objectUtils.listenUpdated(attrs.state, updateListener);
      return context.mobxUtils.reaction(() => attrs.state, listen, { fireImmediately: true });
    });

    /* --------------------------------------------- *\
     # Room Members State
    \* --------------------------------------------- */

    sideEffectManager.add(() => {
      const onRoomStateChanged = (e: Partial<RoomState>) => {
        if (e?.roomMembers) {
          postMessage({
            type: "RoomMembersChanged",
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
        postMessage({ type: "PageChanged", payload: { oldValue, newValue } });
      };
      return context.mobxUtils.reaction(() => attrs.page, updateListener);
    });

    /* --------------------------------------------- *\
     # Writable State
    \* --------------------------------------------- */

    sideEffectManager.add(() => {
      const updateListener = () => {
        postMessage({
          type: "WritableChanged",
          payload: context.getIsWritable(),
        });
        if (debug) {
          logger.log(`writableChange changed to ${context.getIsWritable()}`);
        }
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
          postMessage({ type: "ReceiveMagixMessage", payload: e.payload });
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
        type: "Init",
        payload: {
          state: toJSON(attrs.state),
          page: attrs.page,
          writable: context.getIsWritable(),
          roomMembers: transformRoomMembers(displayer.state.roomMembers),
          debug,
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

    sideEffectManager.addEventListener(window, "message", e => {
      if (e.source !== iframe.contentWindow) return;
      if (!isObj(e.data)) {
        logger.error("window message data should be object, instead got", e.data);
        return;
      }

      const data = e.data as FromSDKMessage;
      logger.log("receive", data);

      switch (data.type) {
        case "Init": {
          sendInitData();
          break;
        }
        case "SetState": {
          setState(data.payload);
          break;
        }
        case "SetPage": {
          setPage(data.payload);
          break;
        }
        case "SendMagixMessage": {
          sendMagixMessage(data.payload);
          break;
        }
        case "MoveCamera": {
          moveCamera(data.payload);
          break;
        }
      }
    });

    context.emitter.on("destroy", () => {
      if (debug) {
        logger.log("destroy");
      }
      sideEffectManager.flushAll();
    });

    // Load the iframe page
    iframe.src = attrs.src;
  },
};

export default EmbeddedPage;
