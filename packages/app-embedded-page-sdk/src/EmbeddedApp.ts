import type {
  CameraState,
  DefaultState,
  Diff,
  DiffOne,
  FromSDKMessage,
  FromSDKMessageKey,
  InitData,
  MetaData,
  RoomMember,
  ToSDKMessage,
  ToSDKMessageKey,
  ToSDKMessagePayloads,
} from "@netless/app-embedded-page";
import { Logger } from "@netless/app-shared";
import { SideEffectManager } from "side-effect-manager";
import { EmbeddedPageEvent } from "./EmbeddedPageEvent";
import type { MaybeRefValue } from "./utils";
import { has } from "./utils";
import { isDiffOne, isObj, isRef, makeRef, plainObjectKeys } from "./utils";

export class EmbeddedApp<TState = DefaultState, TMessage = unknown> {
  constructor(initData: InitData<TState>, ensureState?: TState) {
    this._state = this._initState(initData.state);
    if (ensureState) {
      this.ensureState(ensureState);
    }

    this._writable = initData.writable;
    this._page = initData.page;
    this._meta = initData.meta;
    this._roomMembers = initData.roomMembers;
    this.debug = initData.debug;

    this.logger = new Logger("EmbeddedPageSDK", initData.debug);

    this.sideEffect.addEventListener(window, "message", e => {
      if (!parent || e.source !== parent) return;
      if (!isObj(e.data)) {
        this.logger.error("window message data should be object, instead got", e.data);
        return;
      }

      const message = e.data as
        | ToSDKMessage<Exclude<ToSDKMessageKey, "Init">, TState, TMessage>
        | undefined;

      if (message?.type) {
        const method = `_handleMsg${message.type}` as const;
        if (this[method]) {
          this[method](message.payload);
        }
      }
    });
  }

  /**
   * App meta data
   */
  get meta() {
    return this._meta;
  }

  private _meta: MetaData;

  /**
   * Whiteboard room members
   */
  get roomMembers() {
    return this._roomMembers;
  }

  readonly onRoomMembersChanged = new EmbeddedPageEvent<DiffOne<ReadonlyArray<RoomMember>>>();

  private _roomMembers: ReadonlyArray<RoomMember>;

  private _handleMsgRoomMembersChanged(payload: unknown): void {
    if (payload == null || Array.isArray(payload)) {
      const oldRoomMembers = this._roomMembers;
      this._roomMembers = payload as ReadonlyArray<RoomMember>;
      this.onRoomMembersChanged.dispatch({
        newValue: this._roomMembers,
        oldValue: oldRoomMembers,
      });
    }
  }

  /*
   * Move the camera
   */
  moveCamera(camera: Partial<CameraState>) {
    this.postMessage({ type: "MoveCamera", payload: camera });
  }

  /*
   * Magix Events
   */

  sendMessage(payload: TMessage) {
    this.postMessage({ type: "SendMagixMessage", payload });
  }

  readonly onMessage = new EmbeddedPageEvent<TMessage>();

  private _handleMsgReceiveMagixMessage(payload: unknown): void {
    this.onMessage.dispatch(payload as TMessage);
  }

  /**
   * Whiteboard writable state
   */
  get isWritable() {
    return this._writable;
  }

  readonly onWritableChanged = new EmbeddedPageEvent<DiffOne<boolean>>();

  private _writable: boolean;

  private _handleMsgWritableChanged(payload: unknown): void {
    const newValue = Boolean(payload);
    const oldValue = this._writable;

    if (newValue !== oldValue) {
      this._writable = newValue;
      this.onWritableChanged.dispatch({ oldValue, newValue });
    }
  }

  /**
   * App page info
   */
  get page() {
    return this._page;
  }

  setPage(page: string): void {
    this._page = page;
    this.postMessage({ type: "SetPage", payload: page });
  }

  readonly onPageChanged = new EmbeddedPageEvent<DiffOne<string>>();

  private _page?: string;

  private _handleMsgPageChanged(payload: unknown): void {
    if (isDiffOne<string>(payload)) {
      this._page = payload.newValue;
      this.onPageChanged.dispatch(payload);
    }
  }

  /**
   * App State
   */
  get state() {
    return this._state;
  }

  readonly onStateChanged = new EmbeddedPageEvent<Diff<TState>>();

  ensureState(state: Partial<TState>): void {
    return this.setState(
      plainObjectKeys(state).reduce((payload, key) => {
        if (!has(this._state, key)) {
          payload[key] = state[key];
        }
        return payload;
      }, {} as Partial<TState>)
    );
  }

  setState(state: Partial<TState>): void {
    const keys = plainObjectKeys(state);
    if (
      keys.length > 0 &&
      keys.some(key => state[key] === void 0 || state[key] !== this._state[key])
    ) {
      const newState = { ...this._state };
      const payload: { [K in keyof TState]?: MaybeRefValue<TState[K]> } = {};
      keys.forEach(key => {
        const value = state[key];
        payload[key] = value;
        if (value === void 0) {
          delete newState[key];
        } else if (value !== newState[key]) {
          newState[key] = value as TState[keyof TState];
          if (isObj(value)) {
            const refValue = makeRef(value);
            this.kMap.set(refValue.v, refValue.k);
            payload[key] = refValue as MaybeRefValue<TState[keyof TState]>;
          }
        }
        this._state = newState;
        this.postMessage({ type: "SetState", payload });
      });
    }
  }

  private _state: TState;

  private kMap = new WeakMap<object, string>();

  private _initState(state: { [K in keyof TState]?: MaybeRefValue<TState[K]> }): TState {
    plainObjectKeys(state).forEach(key => {
      const rawValue = state[key];
      if (isRef<TState[keyof TState]>(rawValue)) {
        const { k, v } = rawValue;
        state[key] = v;
        if (isObj(v)) {
          this.kMap.set(v, k);
        }
      }
    });
    return state as TState;
  }

  private _handleMsgStateChanged(payload: unknown): void {
    if (Array.isArray(payload) && payload.length > 0) {
      const lastState = this._state;
      const newState = { ...lastState };
      const diffs: Diff<TState> = {};
      const updatedProperties = payload as ToSDKMessagePayloads<TState, TMessage>["StateChanged"];

      updatedProperties.forEach(({ key, value, kind }) => {
        switch (kind) {
          // Removed
          case 2: {
            delete newState[key];
            diffs[key] = { oldValue: lastState[key] };
            break;
          }
          default: {
            if (isRef<TState[Extract<keyof TState, string>]>(value)) {
              const { k, v } = value;
              const curValue = lastState[key];
              if (isObj(curValue) && this.kMap.get(curValue) === k) {
                newState[key] = curValue;
              } else {
                newState[key] = v;
                if (isObj(v)) {
                  this.kMap.set(v, k);
                }
              }
            } else {
              newState[key] = value;
            }

            diffs[key] = has(lastState, key)
              ? { newValue: value, oldValue: lastState[key] }
              : { newValue: value };
            break;
          }
        }
      });

      this._state = newState;
      this.onStateChanged.dispatch(diffs);
    }
  }

  destroy() {
    this.sideEffect.flushAll();
  }

  private sideEffect = new SideEffectManager();
  private logger: Logger;
  private debug?: boolean;

  private postMessage<TType extends FromSDKMessageKey = FromSDKMessageKey>(
    message: FromSDKMessage<TType, { [K in keyof TState]: MaybeRefValue<TState[K]> }, TMessage>
  ): void {
    this.logger.log("postMessage", message);
    parent.postMessage(message, "*");
  }
}
