/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ReceiveMessages,
  SendMessages,
  DiffOne,
  InitData,
  CameraState,
} from "@netless/app-embedded-page";

import { SideEffectManager } from "side-effect-manager";
import { isObj, isRef, makeRef } from "./utils";

type CheckSendMessageType<T extends { type: keyof ReceiveMessages }> = T;

export type SendMessage<State = any, Message = any> = CheckSendMessageType<
  | { type: "Init" }
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
  const identityMap = new WeakMap<any, string>();
  const oldValues = new Map<keyof State, any>();

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

  function refactorStateChangedPayload() {
    if (!onStateChangedPayload) return;

    for (const [key_, diff] of Object.entries(onStateChangedPayload)) {
      const key = key_ as keyof State;
      const { oldValue, newValue } = diff;

      if (isRef(oldValue)) {
        if (oldValues.has(key)) {
          diff.oldValue = oldValues.get(key);
          oldValues.delete(key);
        } else {
          diff.oldValue = oldValue.v;
        }
      }

      if (isRef(newValue)) {
        if (newValue.k === identityMap.get(state[key])) {
          diff.newValue = state[key] as any;
        } else {
          diff.newValue = newValue.v;
        }
      }

      if (state[key] !== diff.newValue) {
        if (diff.newValue === void 0) {
          delete state[key];
          oldValues.delete(key);
        } else {
          state[key] = diff.newValue as any;
          oldValues.set(key, state[key])
        }
      }
    }
  }

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
        for (const [key, value] of Object.entries(state)) {
          if (isRef(value)) {
            // TODO: arrays (value.v) are represented as {"0":1}
            //       wait embedded-page to fix it
            state[key as keyof State] = value.v as any;
          }
        }
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
        refactorStateChangedPayload();
        onStateChanged.dispatch(onStateChangedPayload);
        break;
      }
      case "GetState": {
        state = event.payload;
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

  const setState = (newState_: Partial<State>) => {
    const newState: Partial<State> = {};
    let changed = false;
    for (const [key_, value_] of Object.entries(newState_)) {
      const key = key_ as keyof State;
      let value = value_ as any;
      oldValues.set(key, state[key]);
      if (value === void 0) {
        delete state[key];
        newState[key] = void 0;
        changed = true;
      } else if (state[key] !== value) {
        state[key] = value;
        if (isObj(value)) {
          value = makeRef(value);
          identityMap.set(value.v, value.k);
        }
        newState[key] = value;
        changed = true;
      }
    }
    if (changed) {
      postMessage({ type: "SetState", payload: newState });
    }
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

  postMessage({ type: "Init" });

  return new Promise(resolve => {
    const handler = () => {
      onInit.removeListener(handler);
      callback?.(app);
      resolve(app);
    };
    onInit.addListener(handler);
  });
}
