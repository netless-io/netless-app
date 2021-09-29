/* eslint-disable @typescript-eslint/no-explicit-any */
import { SideEffectManager } from "side-effect-manager";
import { isObj } from "./utils";

export type SendMessage<State = any, Message = any> =
  | { type: "GetState" }
  | { type: "SetState"; payload: Partial<State> }
  | { type: "SendMessage"; payload: Message };

export type Diff<State> = State extends Record<infer K, unknown>
  ? Record<K, { oldValue?: State[K]; newValue?: State[K] }>
  : never;

export type IncomingMessage<State = any, Message = any> =
  | { type: "Init"; payload: State }
  | { type: "GetState"; payload: State }
  | { type: "StateChanged"; payload: Diff<State> }
  | { type: "ReceiveMessage"; payload: Message };

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
  setState(partialState: Partial<State>): void;
  sendMessage(message: Message): void;
  destroy(): void;
  onInit: Emitter<State>;
  onStateChanged: Emitter<Diff<State>>;
  onMessage: Emitter<Message>;
}

export function createEmbeddedApp<State = any, Message = any>(
  state: State
): EmbeddedApp<State, Message> {
  state = { ...state };

  const onInit = createEmitter<State>();
  const onStateChanged = createEmitter<Diff<State>>();
  const onMessage = createEmitter<Message>();

  const sideEffectManager = new SideEffectManager();
  let onStateChangedPayload: Diff<State> | undefined;

  sideEffectManager.addEventListener(window, "message", e => {
    if (!isObj(e.data)) {
      console.warn("window message data should be object, instead got", e.data);
      return;
    }

    const event = e.data as IncomingMessage<State, Message>;

    if (event.type === "Init") {
      state = { ...state, ...event.payload };
      onInit.dispatch(state);
    } else if (event.type === "GetState") {
      state = event.payload;
      if (onStateChangedPayload) {
        onStateChanged.dispatch(onStateChangedPayload);
        onStateChangedPayload = void 0;
      }
    } else if (event.type === "StateChanged") {
      onStateChangedPayload = event.payload;
      parent.postMessage(<SendMessage>{ type: "GetState" }, "*");
    } else if (event.type === "ReceiveMessage") {
      onMessage.dispatch(event.payload);
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
    parent.postMessage(<SendMessage>{ type: "SetState", payload: newState }, "*");
  };

  const sendMessage = (payload: Message) => {
    parent.postMessage(<SendMessage>{ type: "SendMessage", payload }, "*");
  };

  const destroy = () => sideEffectManager.flushAll();

  return {
    get state() {
      return state;
    },
    onInit,
    setState,
    onStateChanged,
    sendMessage,
    onMessage,
    destroy,
  };
}
