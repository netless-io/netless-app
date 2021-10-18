export type State = Record<string, unknown>;

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

// iframe --> me
export interface ReceiveMessages {
  GetState: void;
  SetState: State;
  SendMessage: unknown;
  GetPage: void;
  SetPage: string;
  GetWritable: void;
  MoveCamera: Partial<CameraState>;
}

type CheckReceiveMessageType<T extends { type: keyof ReceiveMessages }> = T;
export type ReceiveMessage = CheckReceiveMessageType<
  | { type: "GetState" }
  | { type: "SetState"; payload: State }
  | { type: "SendMessage"; payload: unknown }
  | { type: "GetPage" }
  | { type: "SetPage"; payload: string }
  | { type: "GetWritable" }
  | { type: "MoveCamera"; payload: Partial<CameraState> }
>;

export type DiffOne<T> = { oldValue?: T; newValue?: T };

export interface MetaData {
  roomUUID?: string;
  userPayload?: unknown;
}

export interface InitData {
  state: State;
  page?: string;
  writable: boolean;
  meta: MetaData;
}

// me --> iframe
export interface SendMessages {
  Init: InitData;
  GetState: State;
  StateChanged: Record<string, DiffOne<unknown>>;
  ReceiveMessage: unknown;
  GetPage: string | undefined;
  PageChanged: DiffOne<string>;
  GetWritable: boolean;
  WritableChanged: DiffOne<boolean>;
}
