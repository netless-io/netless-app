import type { AkkoObjectUpdatedProperty } from "white-web-sdk";

type TransformMessage<TKey extends keyof Messages, Messages> = TKey extends keyof Messages
  ? Messages[TKey] extends void
    ? { NEAType: TKey; payload?: Messages[TKey] }
    : { NEAType: TKey; payload: Messages[TKey] }
  : never;

export type DefaultState = Record<string, unknown>;

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export interface RoomMember {
  sessionUID: number;
  uid: string;
  userPayload: unknown;
}

// me --> iframe
export interface ToSDKMessagePayloads<TState = DefaultState, TMagix = unknown> {
  Init: InitData<TState>;
  StateChanged: {
    storeId: string;
    actions: ReadonlyArray<AkkoObjectUpdatedProperty<TState, Extract<keyof TState, string>>>;
  };
  StoreChanged: ReadonlyArray<AkkoObjectUpdatedProperty<{ [K: string]: TState }>>;
  PageChanged: DiffOne<string>;
  ReceiveMagixMessage: TMagix;
  WritableChanged: boolean;
  RoomMembersChanged: ReadonlyArray<RoomMember>;
}

export type ToSDKMessageKey = keyof ToSDKMessagePayloads;

export type ToSDKMessage<
  TKey extends ToSDKMessageKey = ToSDKMessageKey,
  TState = DefaultState,
  TMagix = unknown
> = TransformMessage<TKey, ToSDKMessagePayloads<TState, TMagix>>;

// iframe --> me
export interface FromSDKMessagePayloads<TState = DefaultState, TMagix = unknown> {
  Init: void;
  SetState: { storeId: string; state: Partial<TState> };
  GetState: { storeId: string; ensureState: TState };
  SetStore: { [id: string]: unknown };
  SetPage: string;
  SendMagixMessage: TMagix;
  MoveCamera: Partial<CameraState>;
}

export type FromSDKMessageKey = keyof FromSDKMessagePayloads;

export type FromSDKMessage<
  TKey extends FromSDKMessageKey = FromSDKMessageKey,
  TState = DefaultState,
  TMagix = unknown
> = TransformMessage<TKey, FromSDKMessagePayloads<TState, TMagix>>;

export type DiffOne<T> = { oldValue?: T; newValue?: T };

export type Diff<T> = { [K in keyof T]?: DiffOne<T[K]> };

export interface MetaData {
  readonly sessionUID: number;
  readonly uid: string;
  readonly roomUUID?: string;
  readonly userPayload: unknown;
}

export interface InitData<TState = DefaultState> {
  appId: string;
  page?: string;
  writable: boolean;
  meta: MetaData;
  roomMembers: ReadonlyArray<RoomMember>;
  debug?: boolean;
  store: { [k: string]: TState };
  mainStoreId: string;
}

export type PostToSDKMessage<TState = unknown, TMessage = unknown> = <
  TType extends ToSDKMessageKey = ToSDKMessageKey,
  S = TState
>(
  message: ToSDKMessage<TType, S, TMessage>
) => void;

export type AddFromSDKMessageListener<TState = unknown, TMessage = unknown> = (
  listener: (message: FromSDKMessage<FromSDKMessageKey, TState, TMessage>) => void,
  options?: boolean | AddEventListenerOptions
) => () => void;
