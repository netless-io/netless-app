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

import { ensureAttributes } from "@netless/app-shared";
import { SideEffectManager } from "side-effect-manager";

import type { ReceiveMessage, RoomMember, SendMessages, State } from "./types";
import { isObj } from "./utils";
import styles from "./style.scss?inline";

export type {
  DiffOne,
  InitData,
  MetaData,
  ReceiveMessages,
  SendMessages,
  State,
  CameraState,
  RoomMember,
} from "./types";

export interface Attributes {
  src: string;
  state: State;
  page: string;
}

const ClickThroughAppliances = new Set(["clicker", "selector"]);

const EmbeddedPage: NetlessApp<Attributes> = {
  kind: "EmbeddedPage",
  setup(context) {
    const displayer = context.getDisplayer();
    const room = context.getRoom();
    const box = context.getBox();
    const view = context.getView();

    const attrs = ensureAttributes<Attributes>(context, {
      src: "https://example.org",
      state: {},
      page: "",
    });

    const sideEffectManager = new SideEffectManager();

    const container = document.createElement("div");
    container.dataset.appKind = "EmbeddedPage";
    container.classList.add("netless-app-embedded-page");

    const iframe = document.createElement("iframe");
    container.appendChild(iframe);

    box.mountStyles(styles);
    box.mountContent(container);

    function clone<T>(payload: T): T {
      if (payload === void 0) return payload;
      return JSON.parse(JSON.stringify(payload));
    }

    function transformRoomMembers(
      array: ReadonlyArray<PlainRoomMember>
    ): ReadonlyArray<RoomMember> {
      return array.map(({ memberId, payload }) => ({
        sessionUID: memberId,
        uid: payload?.uid,
        userPayload: clone(payload),
      }));
    }

    const postMessage = <T extends keyof SendMessages>(payload: {
      type: T;
      payload: SendMessages[T];
    }) => {
      iframe.contentWindow?.postMessage(payload, "*");
    };

    if (view) {
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
            if (e.roomMembers) {
              postMessage({
                type: "RoomMembersChanged",
                payload: transformRoomMembers(e.roomMembers),
              });
            }
          };
          room.callbacks.on("onRoomStateChanged", onRoomStateChanged);
          return () => room.callbacks.off("onRoomStateChanged", onRoomStateChanged);
        });
      }
    }

    const event = `channel-${context.appId}`;

    sideEffectManager.add(() => {
      const magixListener = (e: Event) => {
        if (e.event === event && e.authorId !== displayer.observerId) {
          postMessage({ type: "ReceiveMessage", payload: e.payload });
        }
      };
      displayer.addMagixEventListener(event, magixListener);
      return () => displayer.removeMagixEventListener(event);
    });

    const sendInitMessage = () => {
      const memberId = displayer.observerId;
      const userPayload = displayer.state.roomMembers.find(
        member => member.memberId === memberId
      )?.payload;

      postMessage({
        type: "Init",
        payload: {
          state: attrs.state,
          page: attrs.page,
          writable: context.getIsWritable(),
          roomMembers: transformRoomMembers(displayer.state.roomMembers),
          meta: {
            sessionUID: memberId,
            // TODO: uid: room?.uid,
            uid: userPayload?.uid,
            roomUUID: room?.uuid,
            userPayload: clone(userPayload),
          },
        },
      });
    };

    sideEffectManager.addEventListener(window, "message", e => {
      if (e.source !== iframe.contentWindow) return;
      if (!isObj(e.data)) return;

      const data = e.data as ReceiveMessage;
      console.log("[EmbeddedPage] receive", data);

      switch (data.type) {
        case "Init": {
          sendInitMessage();
          break;
        }
        case "GetState": {
          postMessage({ type: "GetState", payload: attrs.state });
          break;
        }
        case "SetState": {
          if (isObj(data.payload) && context.getIsWritable()) {
            for (const [key, value] of Object.entries(data.payload)) {
              context.updateAttributes(["state", key], value);
            }
          }
          break;
        }
        case "GetPage": {
          postMessage({ type: "GetPage", payload: attrs.page });
          break;
        }
        case "SetPage": {
          if (!view) {
            console.warn("[EmbeddedPage] SetPage: page api is only available with 'scenePath'");
          } else {
            const value = data.payload;
            const scenePath = context.getInitScenePath();
            if (typeof value === "string" && context.getIsWritable() && scenePath && room) {
              const fullScenePath = [scenePath, value].join("/");
              if (room.scenePathType(fullScenePath) === ("none" as ScenePathType)) {
                room.putScenes(scenePath, [{ name: value }]);
              }
              context.setScenePath(fullScenePath);
              context.updateAttributes(["page"], value);
            }
          }
          break;
        }
        case "GetWritable": {
          postMessage({ type: "GetWritable", payload: context.getIsWritable() });
          break;
        }
        case "SendMessage": {
          if (context.getIsWritable() && room) {
            room.dispatchMagixEvent(event, data.payload);
          }
          break;
        }
        case "MoveCamera": {
          if (isObj(data.payload) && view) {
            view.moveCamera({
              centerX: data.payload.x,
              centerY: data.payload.y,
              scale: data.payload.scale,
              animationMode: "immediately" as AnimationMode.Immediately,
            });
          }
          break;
        }
        case "GetRoomMembers": {
          postMessage({
            type: "GetRoomMembers",
            payload: transformRoomMembers(displayer.state.roomMembers),
          });
          break;
        }
      }
    });

    sideEffectManager.add(() => {
      let oldState = { ...attrs.state };
      const updateListener: AkkoObjectUpdatedListener<State> = updatedProperties => {
        const payload: SendMessages["StateChanged"] = {};
        for (const { key, value } of updatedProperties) {
          payload[key] = { oldValue: oldState[key], newValue: value };
        }
        oldState = { ...attrs.state };
        postMessage({ type: "StateChanged", payload });
      };
      const listen = () => context.objectUtils.listenUpdated(attrs.state, updateListener);
      return context.mobxUtils.reaction(() => attrs.state, listen, { fireImmediately: true });
    });

    sideEffectManager.add(() => {
      const updateListener = (newValue: string, oldValue: string) => {
        postMessage({ type: "PageChanged", payload: { oldValue, newValue } });
      };
      return context.mobxUtils.reaction(() => attrs.page, updateListener);
    });

    sideEffectManager.add(() => {
      let oldValue = context.getIsWritable();
      const updateListener = () => {
        const newValue = context.getIsWritable();
        postMessage({
          type: "WritableChanged",
          payload: { oldValue, newValue },
        });
        oldValue = newValue;
      };
      context.emitter.on("writableChange", updateListener);
      return () => context.emitter.off("writableChange", updateListener);
    });

    iframe.src = attrs.src;

    context.emitter.on("destroy", () => {
      console.log("[EmbeddedPage]: destroy");
      sideEffectManager.flushAll();
    });
  },
};

export default EmbeddedPage;
