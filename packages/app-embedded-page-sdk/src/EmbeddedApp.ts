/* eslint-disable @typescript-eslint/no-explicit-any */
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
import type { Logger } from "@netless/app-shared";
import { SideEffectManager } from "side-effect-manager";
import { EmbeddedPageEvent } from "./EmbeddedPageEvent";
import type { Store, TStateLike } from "./Store/Store";
import { StoreImpl } from "./Store/Store";
import type { MaybeRefValue } from "./utils";
import { has } from "./utils";
import { isDiffOne, isObj } from "./utils";

export type PostFromSDKMessage<TState extends object = DefaultState, TMessage = unknown> = <
  TType extends FromSDKMessageKey = FromSDKMessageKey,
  S = TState
>(
  message: FromSDKMessage<TType, { [K in keyof S]: MaybeRefValue<S[K]> }, TMessage>
) => void;

export type AddToSDKMessageListener<TState extends object = DefaultState, TMessage = unknown> = (
  listener: (message: ToSDKMessage<ToSDKMessageKey, TState, TMessage>) => void,
  options?: boolean | AddEventListenerOptions
) => () => void;

export class EmbeddedApp<TState extends object = DefaultState, TMessage = unknown> {
  public readonly appId: string;
  public readonly debug: boolean;
  private _logger: Logger;
  private _postMessage: PostFromSDKMessage<TState, TMessage>;

  constructor(
    initData: InitData<TState>,
    ensureState: TState,
    debug: boolean,
    postMessage: PostFromSDKMessage<TState, TMessage>,
    addMessageListener: AddToSDKMessageListener<TState, TMessage>,
    logger: Logger
  ) {
    this.appId = initData.appId;
    this.debug = debug;

    this._postMessage = postMessage;

    this._mainStoreId = initData.mainStoreId;
    this._storeRawData = initData.store || { [this._mainStoreId]: {} };

    this._writable = initData.writable;
    this._page = initData.page;
    this._meta = initData.meta;
    this._roomMembers = initData.roomMembers;

    this._logger = logger;

    this._sideEffect.add(() =>
      addMessageListener(message => {
        const { NEAType, payload } = message as ToSDKMessage<
          Exclude<ToSDKMessageKey, "Init">,
          TState,
          TMessage
        >;
        if (NEAType) {
          const method = `_handleMsg${NEAType}` as const;
          if (this[method]) {
            this[method](payload);
          }
        }
      })
    );

    this._mainStore = this.connectStore(initData.mainStoreId, ensureState);
    this.onStateChanged = this._mainStore.onStateChanged;
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
    this._postMessage({ NEAType: "MoveCamera", payload: camera });
  }

  /*
   * Magix Events
   */

  sendMessage(payload: TMessage) {
    this._postMessage({ NEAType: "SendMagixMessage", payload });
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
    this._postMessage({ NEAType: "SetPage", payload: page });
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
   * App Store
   */
  private _storeRawData: Record<string, unknown>;

  private _stores = new Map<string, Store>();

  connectStore<S extends TStateLike>(storeId: string, ensureState?: S): Store<S> {
    let store = this._stores.get(storeId) as Store<S> | undefined;
    if (!store) {
      if (!has(this._storeRawData, storeId)) {
        const storeState = {};
        this._postMessage({ NEAType: "SetStore", payload: { [storeId]: storeState } });
        this._storeRawData[storeId] = storeState;
      }

      store = new StoreImpl<S>({
        id: storeId,
        state: this._storeRawData[storeId] as S,
        logger: this._logger,
        getIsWritable: () => this._writable,
        onSetState: state =>
          this._postMessage<"SetState", S>({ NEAType: "SetState", payload: { storeId, state } }),
      }) as Store<S>;

      this._stores.set(storeId, store);
    }

    if (ensureState) {
      store.ensureState(ensureState);
    }

    return store;
  }

  isStoreConnected(id: string): boolean {
    return this._stores.has(id);
  }

  removeStore(id: string): void {
    if (id === this._mainStoreId) {
      this._logger.error(`Store "${id}" is not removable.`);
      return;
    }
    const store = this._stores.get(id) as StoreImpl<TState>;
    if (store) {
      this._stores.delete(id);
      store._destroy();
    }
    if (this._storeRawData[id]) {
      this._postMessage({ NEAType: "SetStore", payload: { [id]: void 0 } });
    }
  }

  private _handleMsgStoreChanged(payload: unknown): void {
    if (Array.isArray(payload) && payload.length > 0) {
      const actions = payload as ToSDKMessagePayloads<TState, TMessage>["StoreChanged"];

      actions.forEach(({ key, value, kind }) => {
        switch (kind) {
          case 2: {
            // Removed
            delete this._storeRawData[key];
            const store = this._stores.get(key);
            if (store) {
              this._stores.delete(key);
              (store as any)._destroy();
            }
            break;
          }
          default: {
            this._storeRawData[key] = value;
            break;
          }
        }
      });
    }
  }

  private _mainStoreId: string;

  get state() {
    return this._mainStore.state;
  }

  private _mainStore: Store<TState>;

  readonly onStateChanged: EmbeddedPageEvent<Diff<TState>>;

  ensureState(state: Partial<TState>): void {
    return this._mainStore.ensureState(state);
  }

  setState(state: Partial<TState>): void {
    return this._mainStore.setState(state);
  }

  private _handleMsgStateChanged(payload: unknown): void {
    if (
      isObj(payload) &&
      payload.storeId &&
      Array.isArray(payload.actions) &&
      payload.actions.length > 0
    ) {
      const { storeId, actions } = payload as ToSDKMessagePayloads<
        TState,
        TMessage
      >["StateChanged"];

      actions.forEach(({ key, value, kind }) => {
        switch (kind) {
          // Removed
          case 2: {
            const storeData = this._storeRawData[storeId];
            if (isObj(storeData)) {
              delete storeData[key];
            }
            break;
          }
          default: {
            const storeData = this._storeRawData[storeId];
            if (isObj(storeData)) {
              storeData[key] = value;
            }
            break;
          }
        }
      });

      const store = this._stores.get(storeId) as StoreImpl<TState> | undefined;
      if (store) {
        store._updateProperties(actions);
      }
    }
  }

  destroy() {
    this._sideEffect.flushAll();
  }

  private _sideEffect = new SideEffectManager();
}
