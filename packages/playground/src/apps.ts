import type { AddAppParams } from "@netless/window-manager";
import { WindowManager } from "@netless/window-manager";

import type { PlaygroundConfig, PlaygroundConfigs } from "../typings";
import { debug } from "./log";

const CONFIGS = import.meta.glob("../../*/playground.ts");

export interface AppGroup {
  kind: string;
  configs: AddAppParams[];
}

export async function registerApps(): Promise<AppGroup[]> {
  const appConfigs = (await Promise.all(Object.values(CONFIGS).map(f => f()))) as {
    default: PlaygroundConfig | PlaygroundConfigs;
  }[];
  const apps: AppGroup[] = [];
  for (let { default: a } of appConfigs) {
    if (!Array.isArray(a)) a = [a];
    debug("[register]", a[0].app.kind);
    const item: AppGroup = { kind: a[0].app.kind, configs: [] };
    for (const { app, ...rest } of a) {
      WindowManager.register({ kind: app.kind, src: app });
      item.configs.push({ kind: app.kind, ...rest });
    }
    apps.push(item);
  }
  window.apps = apps;
  return apps;
}
