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
    debug("[register]", a[0].kind);
    const item: AppGroup = { kind: a[0].kind, configs: [] };
    for (const { kind, src, ...rest } of a) {
      const wrapped = async () => {
        if (typeof src === "function") {
          const mod = await src();
          return "default" in mod ? mod.default : mod;
        } else {
          return src;
        }
      };
      WindowManager.register({ kind, src: wrapped });
      item.configs.push({ kind, ...rest });
    }
    apps.push(item);
  }
  window.apps = apps;
  return apps;
}
