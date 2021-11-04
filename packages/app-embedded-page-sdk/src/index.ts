/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ToSDKMessage, ToSDKMessageKey, DefaultState } from "@netless/app-embedded-page";
import type { LoggerDebugLevel } from "@netless/app-shared";
import { Logger } from "@netless/app-shared";

import type { PostFromSDKMessage, AddToSDKMessageListener } from "./EmbeddedApp";
import { EmbeddedApp } from "./EmbeddedApp";
import { isObj } from "./utils";

export * from "./EmbeddedApp";
export * from "./EmbeddedPageEvent";

export type EmbeddedAppConfigBase<TState = unknown, TMessage = unknown> = {
  debug?: LoggerDebugLevel;
  postMessage?: PostFromSDKMessage<TState, TMessage>;
  addMessageListener?: AddToSDKMessageListener<TState, TMessage>;
};

export type EmbeddedAppConfigWithState<TState = unknown, TMessage = unknown> = {
  ensureState: TState;
} & EmbeddedAppConfigBase<TState, TMessage>;

export type EmbeddedAppConfig<TState = unknown, TMessage = unknown> = {
  ensureState?: TState;
} & EmbeddedAppConfigBase<TState, TMessage>;

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
  config: EmbeddedAppConfigWithState<TState, TMessage>
): Promise<EmbeddedApp<TState, TMessage>>;
export function createEmbeddedApp<TState = DefaultState, TMessage = unknown>(
  config: EmbeddedAppConfigBase<TState, TMessage>
): Promise<EmbeddedApp<TState | Record<string, unknown>, TMessage>>;
export function createEmbeddedApp<TState = DefaultState, TMessage = unknown>(
  config: EmbeddedAppConfig<TState, TMessage> = {}
): Promise<EmbeddedApp<TState, TMessage>> {
  if (!parent) {
    throw new Error("[EmbeddedPageSDK]: SDK is not running in a iframe.");
  }

  if (singleApp) {
    return Promise.resolve(singleApp);
  }

  const logger = new Logger("EmbeddedPageSDK", config.debug);

  const postMessage: PostFromSDKMessage<TState, TMessage> =
    config.postMessage ||
    (message => {
      logger.log("Message to parent", message);
      parent.postMessage(message, "*");
    });

  const addMessageListener: AddToSDKMessageListener<TState, TMessage> =
    config.addMessageListener ||
    ((listener, options) => {
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
    });

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
        const app = new EmbeddedApp<TState, TMessage>(
          message.payload,
          config.ensureState || ({} as TState),
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
