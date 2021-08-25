import type { AddAppParams, NetlessApp } from "@netless/window-manager";

export type PlaygroundConfig = Omit<AddAppParams, "kind"> & { app: NetlessApp };
export type PlaygroundConfigs = PlaygroundConfig[];
