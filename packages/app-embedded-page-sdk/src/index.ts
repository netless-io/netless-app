/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  FromSDKMessage,
  ToSDKMessage,
  ToSDKMessageKey,
  DefaultState,
} from "@netless/app-embedded-page";

import { EmbeddedApp } from "./EmbeddedApp";
import { isObj } from "./utils";

export interface EmbeddedAppConfig<TState> {
  ensureState?: TState;
}

/**
 * @example
 * interface State { count: number }
 * type Message = { type: "click"; payload: { id: string } };
 * const app = await createEmbeddedApp<State, Message>((app) => {
 *   app.ensureState({ count: 0 })
 * });
 */
export function createEmbeddedApp<TState = DefaultState, TMessage = unknown>({
  ensureState,
}: EmbeddedAppConfig<TState> = {}): Promise<EmbeddedApp<TState, TMessage>> {
  if (!parent) {
    throw new Error("[EmbeddedPageSDK]: SDK is not running in a iframe.");
  }

  parent.postMessage({ type: "Init" } as FromSDKMessage<"Init", TState, TMessage>, "*");

  return new Promise(resolve => {
    const handler = ({
      data,
      source,
    }: MessageEvent<ToSDKMessage<ToSDKMessageKey, TState, TMessage>>) => {
      if (!parent || source !== parent) return;
      if (!isObj(data)) {
        console.warn("window message data should be object, instead got", data);
        return;
      }

      if (data.type === "Init") {
        window.removeEventListener("message", handler);

        const app = new EmbeddedApp<TState, TMessage>(data.payload, ensureState);

        resolve(app);
      }
    };
    window.addEventListener("message", handler);
  });
}
