/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ReceiveMessages,
  SendMessages,
  DiffOne,
  InitData,
  CameraState,
} from "@netless/app-embedded-page";

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
  | { type: "MoveCamera"; payload: Partial<CameraState> }
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

export interface EmbeddedApp<State = Record<string, any>, Message = any> {
  readonly state: Readonly<State>;
  readonly page?: string;
  readonly isWritable: boolean;
  readonly meta: Readonly<InitData["meta"]>;
  ensureState(partialState: Partial<State>): void;
  setState(partialState: Partial<State>): void;
  setPage(page: string): void;
  sendMessage(message: Message): void;
  moveCamera(camera: Partial<CameraState>): void;
  destroy(): void;
  onStateChanged: Emitter<Diff<State>>;
  onPageChanged: Emitter<DiffOne<string>>;
  onWritableChanged: Emitter<DiffOne<boolean>>;
  onMessage: Emitter<Message>;
}

/**
 * @example
 * interface State { count: number }
 * type Message = { type: "click"; payload: { id: string } };
 * const app = await createEmbeddedApp<State, Message>((app) => {
 *   app.ensureState({ count: 0 })
 * });
 */
export function createEmbeddedApp<State = Record<string, any>, Message = any>(
  callback?: (app: EmbeddedApp<State, Message>) => void
): Promise<EmbeddedApp<State, Message>> {
  let state: State;
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

    switch (event.type) {
      case "Init": {
        const { payload } = event;
        state = payload.state as unknown as State;
        page = payload.page;
        writable = payload.writable;
        meta = payload.meta;
        onInit.dispatch(payload);
        break;
      }
      case "ReceiveMessage": {
        onMessage.dispatch(event.payload);
        break;
      }
      case "StateChanged": {
        onStateChangedPayload = event.payload;
        postMessage({ type: "GetState" });
        break;
      }
      case "GetState": {
        state = event.payload;
        if (onStateChangedPayload) {
          onStateChanged.dispatch(onStateChangedPayload);
          onStateChangedPayload = void 0;
        }
        break;
      }
      case "PageChanged": {
        onPageChangedPayload = event.payload;
        postMessage({ type: "GetPage" });
        break;
      }
      case "GetPage": {
        page = event.payload;
        if (onPageChangedPayload) {
          onPageChanged.dispatch(onPageChangedPayload);
          onPageChangedPayload = void 0;
        }
        break;
      }
      case "WritableChanged": {
        onWritableChangedPayload = event.payload;
        postMessage({ type: "GetWritable" });
        break;
      }
      case "GetWritable": {
        writable = event.payload;
        if (onWritableChangedPayload) {
          onWritableChanged.dispatch(onWritableChangedPayload);
          onWritableChangedPayload = void 0;
        }
        break;
      }
    }
  });

  const ensureState = (initialState: Partial<State>) => {
    state = { ...initialState, ...state };
  };

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

  const setPage = (newPage: string) => {
    page = newPage;
    postMessage({ type: "SetPage", payload: newPage });
  };

  const sendMessage = (payload: Message) => {
    postMessage({ type: "SendMessage", payload });
  };

  const moveCamera = (camera: Partial<CameraState>) => {
    postMessage({ type: "MoveCamera", payload: camera });
  };

  const destroy = () => sideEffectManager.flushAll();

  const app: EmbeddedApp<State, Message> = {
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
    ensureState,
    setState,
    setPage,
    sendMessage,
    moveCamera,
    destroy,
    onStateChanged,
    onPageChanged,
    onWritableChanged,
    onMessage,
  };

  return new Promise(resolve => {
    const handler = () => {
      onInit.removeListener(handler);
      callback?.(app);
      resolve(app);
    };
    onInit.addListener(handler);
  });
}
