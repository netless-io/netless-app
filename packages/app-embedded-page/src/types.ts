/* eslint-disable @typescript-eslint/no-explicit-any */

export type State = Record<string, unknown>;

// iframe --> me
export interface ReceiveMessages {
  GetState: void;
  SetState: State;
  SendMessage: unknown;
}

// me --> iframe
export interface SendMessages {
  Init: State;
  GetState: State;
  StateChanged: Record<string, { oldValue: unknown; newValue: unknown }>;
  ReceiveMessage: unknown;
}
