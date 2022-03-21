import type { AddAppParams, NetlessApp, RegisterParams } from "@netless/window-manager";

export type PlaygroundConfig<T = unknown> = Omit<AddAppParams, "src" | "attributes"> & {
  src: NetlessApp<T> | (() => Promise<NetlessApp<T> | { default: NetlessApp<T> }>);
  attributes?: Partial<T>;
  appOptions?: Record<string, unknown>;
  addHooks?: RegisterParams["addHooks"];
  getAttributes?: () => Partial<T> | undefined | null;
};

export type PlaygroundConfigs<T = unknown> = PlaygroundConfig<T>[];
