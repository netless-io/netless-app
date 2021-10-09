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
  page: string;
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
      page: "",
    });

    const sideEffectManager = new SideEffectManager();

    const container = document.createElement("div");
    Object.assign(container.style, { width: "100%", height: "100%", position: "relative" });

    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { width: "100%", height: "100%", border: "none" });
    container.appendChild(iframe);

    const viewBox = document.createElement("div");
    Object.assign(viewBox.style, {
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
    });
    container.appendChild(viewBox);

    box.mountContent(container);
    context.mountView(viewBox);

    const postMessage = <T extends keyof SendMessages>(payload: {
      type: T;
      payload: SendMessages[T];
    }) => {
      iframe.contentWindow?.postMessage(payload, "*");
    };

    const event = `channel-${context.appId}`;

    const magixListener = (e: Event) => {
      if (e.event === event && e.authorId !== displayer.observerId) {
        postMessage({ type: "ReceiveMessage", payload: e.payload });
      }
    };

    sideEffectManager.add(() => {
      displayer.addMagixEventListener(event, magixListener);
      return () => displayer.removeMagixEventListener(event);
    });

    sideEffectManager.addEventListener(iframe, "load", () => {
      postMessage({ type: "Init", payload: attrs.state });
    });

    sideEffectManager.addEventListener(window, "message", e => {
      if (e.source !== iframe.contentWindow) return;
      if (!isObj(e.data)) return;

      const { data } = e;
      const type = data.type as keyof ReceiveMessages;

      console.log("[EmbeddedPage] receive", data);

      if (type === "GetState") {
        postMessage({ type: "GetState", payload: attrs.state });
      } else if (type === "SetState") {
        if (isObj(data.payload) && context.getIsWritable()) {
          for (const [key, value] of Object.entries(data.payload)) {
            context.updateAttributes(["state", key], value);
          }
        }
      } else if (type === "GetPage") {
        postMessage({ type: "GetPage", payload: attrs.page });
      } else if (type === "SetPage") {
        const value = data.payload as ReceiveMessages["SetPage"];
        if (typeof value === "string" && context.getIsWritable()) {
          context.updateAttributes(["page"], value);
        }
        // TODO: if not exist page, putScenes()
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

    iframe.src = attrs.src;

    context.emitter.on("destroy", () => {
      console.log("[EmbeddedPage]: destroy");
      sideEffectManager.flushAll();
    });
  },
};

export default EmbeddedPage;
