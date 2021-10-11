export type State = Record<string, unknown>;

// iframe --> me
export interface ReceiveMessages {
  GetState: void;
  SetState: State;
  SendMessage: unknown;
  GetPage: void;
  SetPage: string;
  GetWritable: void;
}

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
