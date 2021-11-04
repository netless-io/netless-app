/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  FromSDKMessage,
  ToSDKMessage,
  ToSDKMessageKey,
  DefaultState,
  FromSDKMessageKey,
} from "@netless/app-embedded-page";
import type { LoggerDebugLevel } from "@netless/app-shared";
import { Logger } from "@netless/app-shared";

import { EmbeddedApp } from "./EmbeddedApp";
import type { MaybeRefValue } from "./utils";
import { isObj } from "./utils";

export interface EmbeddedAppConfig<TState> {
  ensureState: TState;
  debug?: LoggerDebugLevel;
}

let singleApp: EmbeddedApp<any, any> | undefined;

/**
 * @example
 * interface State { count: number }
 * type Message = { type: "click"; payload: { id: string } };
 * const app = await createEmbeddedApp<State, Message>((app) => {
 *   app.ensureState({ count: 0 })
 * });
 */
export function createEmbeddedApp<TState = DefaultState, TMessage = unknown>(): Promise<
  EmbeddedApp<TState | Record<string, unknown>, TMessage>
>;
export function createEmbeddedApp<TState = DefaultState, TMessage = unknown>(
  config: EmbeddedAppConfig<TState>
): Promise<EmbeddedApp<TState, TMessage>>;
export function createEmbeddedApp<TState = DefaultState, TMessage = unknown>(
  config: Partial<EmbeddedAppConfig<TState>>
): Promise<EmbeddedApp<TState | Record<string, unknown>, TMessage>>;
export function createEmbeddedApp<TState = DefaultState, TMessage = unknown>(
  config: Partial<EmbeddedAppConfig<TState>> = {}
): Promise<EmbeddedApp<TState | Record<string, unknown>, TMessage>> {
  if (!parent) {
    throw new Error("[EmbeddedPageSDK]: SDK is not running in a iframe.");
  }

  if (singleApp) {
    return Promise.resolve(singleApp);
  }

  const logger = new Logger("EmbeddedPageSDK", config.debug);

  const postMessage = <S = TState, TType extends FromSDKMessageKey = FromSDKMessageKey>(
    message: FromSDKMessage<TType, { [K in keyof S]: MaybeRefValue<S[K]> }, TMessage>
  ): void => {
    logger.log("Message to parent", message);
    parent.postMessage(message, "*");
  };

  const addMessageListener = (
    listener: (message: ToSDKMessage<ToSDKMessageKey, TState, TMessage>) => any,
    options?: boolean | AddEventListenerOptions
  ): (() => void) => {
    const handler = ({
      data,
      source,
    }: MessageEvent<ToSDKMessage<ToSDKMessageKey, TState, TMessage>>) => {
      if (!parent || source !== parent) return;
      if (!isObj(data)) {
        console.warn("window message data should be object, instead got", data);
        return;
      }
      logger.log("Message from parent", data);
      listener(data);
    };

    window.addEventListener("message", handler, options);

    return () => {
      window.removeEventListener("message", handler, options);
    };
  };

  postMessage({ type: "Init" });

  return new Promise(resolve => {
    const disposer = addMessageListener(message => {
      if (singleApp) {
        disposer();
        resolve(singleApp);
        return;
      }

      if (message.type === "Init") {
        disposer();
        const app = new EmbeddedApp<TState | Record<string, unknown>, TMessage>(
          message.payload,
          config.ensureState || {},
          postMessage,
          addMessageListener,
          logger
        );
        singleApp = app;
        resolve(app);
      }
    });
  });
}
