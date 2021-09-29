import { ensureAttributes } from "@netless/app-shared";
import type { NetlessApp } from "@netless/window-manager";
import { SideEffectManager } from "side-effect-manager";
import type { AkkoObjectUpdatedListener, Event } from "white-web-sdk";
import type { ReceiveMessages, SendMessages, State } from "./types";
import { isObj } from "./utils";

export type { ReceiveMessages, SendMessages, State } from "./types";

export interface Attributes {
  src: string;
  state: State;
}

const EmbeddedPage: NetlessApp<Attributes> = {
  kind: "EmbeddedPage",
  setup(context) {
    const displayer = context.getDisplayer();
    const room = context.getRoom();
    const box = context.getBox();

    const attrs = ensureAttributes<Attributes>(context, {
      src: "https://example.org",
      state: {},
    });

    const sideEffectManager = new SideEffectManager();

    const content = document.createElement("iframe");
    Object.assign(content.style, { width: "100%", height: "100%", border: "none" });

    box.mountContent(content);

    type MessageToSend<T extends keyof SendMessages> = {
      type: T;
      payload: SendMessages[T];
    };

    const sendMessage = <T extends keyof SendMessages>(payload: MessageToSend<T>) => {
      content.contentWindow?.postMessage(payload, "*");
    };

    const event = `channel-${context.appId}`;

    const magixListener = (e: Event) => {
      if (e.event === event && e.authorId !== displayer.observerId) {
        sendMessage({ type: "ReceiveMessage", payload: e.payload });
      }
    };

    sideEffectManager.add(() => {
      displayer.addMagixEventListener(event, magixListener);
      return () => displayer.removeMagixEventListener(event);
    });

    sideEffectManager.addEventListener(content, "load", () => {
      sendMessage({ type: "Init", payload: attrs.state });
    });

    sideEffectManager.addEventListener(window, "message", e => {
      if (e.source !== content.contentWindow) return;
      if (!isObj(e.data)) return;

      const { data } = e;
      const type = data.type as keyof ReceiveMessages;

      console.log("[EmbeddedPage] receive", data);

      if (type === "GetState") {
        sendMessage({ type: "GetState", payload: attrs.state });
      } else if (type === "SetState") {
        if (isObj(data.payload) && context.getIsWritable()) {
          for (const [key, value] of Object.entries(data.payload)) {
            context.updateAttributes(["state", key], value);
          }
        }
      } else if (type === "SendMessage") {
        if (context.getIsWritable()) {
          room?.dispatchMagixEvent(event, data.payload);
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
        sendMessage({ type: "StateChanged", payload });
      };

      const listen = () => context.objectUtils.listenUpdated(attrs.state, updateListener);

      return context.mobxUtils.reaction(() => attrs.state, listen, { fireImmediately: true });
    });

    content.src = attrs.src;

    context.emitter.on("destroy", () => {
      console.log("[EmbeddedPage]: destroy");
      sideEffectManager.flushAll();
    });
  },
};

export default EmbeddedPage;
