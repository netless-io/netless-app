import type { AddAppParams, NetlessApp } from "@netless/window-manager";

export type PlaygroundConfig<T = unknown> = Omit<AddAppParams, "kind" | "attributes"> & {
  app: NetlessApp<T>;
  attributes?: Partial<T>;
};

export type PlaygroundConfigs<T = unknown> = PlaygroundConfig<T>[];
