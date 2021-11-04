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
import type { Store } from "./Store/Store";
import { StoreImpl } from "./Store/Store";
import type { MaybeRefValue } from "./utils";
import { has } from "./utils";
import { isDiffOne, isObj } from "./utils";

export class EmbeddedApp<TState = DefaultState, TMessage = unknown> {
  constructor(initData: InitData<TState>, ensureState: TState) {
    this.storeNSPrefix = initData.storeConfig.nsPrefix;
    this.mainStoreId = initData.storeConfig.mainId;
    this._storeRawData = initData.store || {
      [this.getStoreNamespace(this.mainStoreId)]: {},
    };

    this._writable = initData.writable;
    this._page = initData.page;
    this._meta = initData.meta;
    this._roomMembers = initData.roomMembers;

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

    this._mainStore = this.connectStore(initData.storeConfig.mainId, ensureState);
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
   * App Store
   */
  private _storeRawData: Record<string, unknown>;

  private _stores = new Map<string, Store>();

  connectStore<S>(id: string, ensureState: S): Store<S> {
    const namespace = this.getStoreNamespace(id);

    let store = this._stores.get(namespace) as Store<S> | undefined;
    if (!store) {
      if (!has(this._storeRawData, namespace)) {
        const storeState = {};
        this.postMessage({ type: "SetStore", payload: { [namespace]: storeState } });
        this._storeRawData[namespace] = storeState;
      }

      store = new StoreImpl<S>({
        id,
        state: this._storeRawData[namespace] as S,
        getIsWritable: () => this._writable,
        onSetState: state =>
          this.postMessage<S>({ type: "SetState", payload: { namespace, state } }),
      }) as Store<S>;

      this._stores.set(namespace, store);
    }

    store.ensureState(ensureState);

    return store;
  }

  hasStore(id: string): boolean {
    return this._stores.has(this.getStoreNamespace(id));
  }

  removeStore(id: string): void {
    if (id === this.mainStoreId) {
      this.logger.error(`Store "${id}" is not removable.`);
      return;
    }
    const namespace = this.getStoreNamespace(id);
    const store = this._stores.get(namespace) as StoreImpl<TState>;
    if (store) {
      this._stores.delete(namespace);
      store._destroy();
    }
    if (this._storeRawData[namespace]) {
      this.postMessage({ type: "SetStore", payload: { [namespace]: void 0 } });
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
              (store as StoreImpl)._destroy();
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

  private storeNSPrefix: string;
  private mainStoreId: string;

  getStoreNamespace(id: string): string {
    return this.storeNSPrefix + id;
  }

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
      payload.namespace &&
      Array.isArray(payload.actions) &&
      payload.actions.length > 0
    ) {
      const { namespace, actions } = payload as ToSDKMessagePayloads<
        TState,
        TMessage
      >["StateChanged"];

      actions.forEach(({ key, value, kind }) => {
        switch (kind) {
          // Removed
          case 2: {
            const storeData = this._storeRawData[namespace];
            if (isObj(storeData)) {
              delete storeData[key];
            }
            break;
          }
          default: {
            const storeData = this._storeRawData[namespace];
            if (isObj(storeData)) {
              storeData[key] = value;
            }
            break;
          }
        }
      });

      const store = this._stores.get(namespace) as StoreImpl<TState> | undefined;
      if (store) {
        store._updateProperties(actions);
      }
    }
  }

  destroy() {
    this.sideEffect.flushAll();
  }

  private sideEffect = new SideEffectManager();
  private logger: Logger;

  private postMessage<S = TState, TType extends FromSDKMessageKey = FromSDKMessageKey>(
    message: FromSDKMessage<TType, { [K in keyof S]: MaybeRefValue<S[K]> }, TMessage>
  ): void {
    this.logger.log("postMessage", message);
    parent.postMessage(message, "*");
  }
}
