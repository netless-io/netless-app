export type State = Record<string, unknown>;

// iframe --> me
export interface ReceiveMessages {
  GetState: void;
  SetState: State;
  SendMessage: unknown;
  GetPage: void;
  SetPage: string;
}

// me --> iframe
export interface SendMessages {
  Init: State;
  GetState: State;
  StateChanged: Record<string, { oldValue: unknown; newValue: unknown }>;
  ReceiveMessage: unknown;
  GetPage: string | undefined;
  PageChanged: { oldValue?: string; newValue?: string };
}
