import type { AddAppParams, NetlessApp } from "@netless/window-manager";

export type PlaygroundConfig<T = any> = Omit<
  AddAppParams,
  "kind" | "attributes"
> & {
  app: NetlessApp<T>;
  attributes?: Partial<T>;
};

export type PlaygroundConfigs<T = any> = PlaygroundConfig<T>[];
