/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReceiveMessages, SendMessages, DiffOne, InitData } from "@netless/app-embedded-page";
import { SideEffectManager } from "side-effect-manager";
import { isObj } from "./utils";

type CheckSendMessageType<T extends { type: keyof ReceiveMessages }> = T;

export type SendMessage<State = any, Message = any> = CheckSendMessageType<
  | { type: "GetState" }
  | { type: "SetState"; payload: Partial<State> }
  | { type: "SendMessage"; payload: Message }
  | { type: "GetPage" }
  | { type: "SetPage"; payload: string }
  | { type: "GetWritable" }
>;

export type Diff<State> = State extends Record<infer K, unknown>
  ? Record<K, DiffOne<State[K]>>
  : never;

type CheckIncomingMessageType<T extends { type: keyof SendMessages }> = T;

export type IncomingMessage<State = any, Message = any> = CheckIncomingMessageType<
  | { type: "Init"; payload: InitData }
  | { type: "GetState"; payload: State }
  | { type: "StateChanged"; payload: Diff<State> }
  | { type: "ReceiveMessage"; payload: Message }
  | { type: "GetPage"; payload: string | undefined }
  | { type: "PageChanged"; payload: DiffOne<string> }
  | { type: "GetWritable"; payload: boolean }
  | { type: "WritableChanged"; payload: DiffOne<boolean> }
>;

export type Listener<T> = (event: T) => void;

export interface Emitter<T> {
  dispatch(event: T): void;
  addListener(listener: Listener<T>): void;
  removeListener(listener: Listener<T>): void;
}

function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<Listener<T>>();

  const dispatch = (event: T) => listeners.forEach(f => f(event));
  const addListener = (listener: Listener<T>) => listeners.add(listener);
  const removeListener = (listener: Listener<T>) => listeners.delete(listener);

  return { dispatch, addListener, removeListener };
}

export interface EmbeddedApp<State = any, Message = any> {
  readonly state: Readonly<State>;
  readonly page?: string;
  readonly isWritable: boolean;
  readonly meta: Readonly<InitData["meta"]>;
  setState(partialState: Partial<State>): void;
  setPage(page: string): void;
  sendMessage(message: Message): void;
  destroy(): void;
  onInit: Emitter<InitData>;
  onStateChanged: Emitter<Diff<State>>;
  onPageChanged: Emitter<DiffOne<string>>;
  onWritableChanged: Emitter<DiffOne<boolean>>;
  onMessage: Emitter<Message>;
}

/**
 * @example
 * interface State { count: number }
 * type Message = { type: "click"; payload: { id: string } };
 * const app = createEmbeddedApp<State, Message>({ count: 0 });
 */
export function createEmbeddedApp<State = any, Message = any>(
  state: State
): EmbeddedApp<State, Message> {
  state = { ...state };
  let page: string | undefined;
  let writable = false;
  let meta: Readonly<InitData["meta"]>;

  const onInit = createEmitter<InitData>();
  const onMessage = createEmitter<Message>();

  const onStateChanged = createEmitter<Diff<State>>();
  const onPageChanged = createEmitter<DiffOne<string>>();
  const onWritableChanged = createEmitter<DiffOne<boolean>>();

  const sideEffectManager = new SideEffectManager();
  let onStateChangedPayload: Diff<State> | undefined;
  let onPageChangedPayload: DiffOne<string> | undefined;
  let onWritableChangedPayload: DiffOne<boolean> | undefined;

  function postMessage(message: SendMessage) {
    parent.postMessage(message, "*");
  }

  sideEffectManager.addEventListener(window, "message", e => {
    if (!isObj(e.data)) {
      console.warn("window message data should be object, instead got", e.data);
      return;
    }

    const event = e.data as IncomingMessage<State, Message>;

    if (event.type === "Init") {
      const { payload } = event;
      payload.state = state = { ...state, ...payload.state };
      page = payload.page;
      writable = payload.writable;
      meta = payload.meta;
      onInit.dispatch(payload);
    } else if (event.type === "ReceiveMessage") {
      onMessage.dispatch(event.payload);
    } else {
      if (event.type === "StateChanged") {
        onStateChangedPayload = event.payload;
        postMessage({ type: "GetState" });
      } else if (event.type === "GetState") {
        state = event.payload;
        if (onStateChangedPayload) {
          onStateChanged.dispatch(onStateChangedPayload);
          onStateChangedPayload = void 0;
        }
      }

      if (event.type === "PageChanged") {
        onPageChangedPayload = event.payload;
        postMessage({ type: "GetPage" });
      } else if (event.type === "GetPage") {
        page = event.payload;
        if (onPageChangedPayload) {
          onPageChanged.dispatch(onPageChangedPayload);
          onPageChangedPayload = void 0;
        }
      }

      if (event.type === "WritableChanged") {
        onWritableChangedPayload = event.payload;
        postMessage({ type: "GetWritable" });
      } else if (event.type === "GetWritable") {
        writable = event.payload;
        if (onWritableChangedPayload) {
          onWritableChanged.dispatch(onWritableChangedPayload);
          onWritableChangedPayload = void 0;
        }
      }
    }
  });

  const setState = (newState: Partial<State>) => {
    for (const [key, value] of Object.entries(newState)) {
      if (value === void 0) {
        delete state[key as keyof State];
      } else {
        state[key as keyof State] = value as State[keyof State];
      }
    }
    postMessage({ type: "SetState", payload: newState });
  };

  const setPage = (page: string) => {
    postMessage({ type: "SetPage", payload: page });
  };

  const sendMessage = (payload: Message) => {
    postMessage({ type: "SendMessage", payload });
  };

  const destroy = () => sideEffectManager.flushAll();

  return {
    get state() {
      return state;
    },
    get page() {
      return page;
    },
    get isWritable() {
      return writable;
    },
    get meta() {
      return meta;
    },
    setState,
    setPage,
    sendMessage,
    destroy,
    onInit,
    onStateChanged,
    onPageChanged,
    onWritableChanged,
    onMessage,
  };
}
