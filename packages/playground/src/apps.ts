import type { AddAppParams } from "@netless/window-manager";
import { WindowManager } from "@netless/window-manager";

import type { PlaygroundConfigs } from "../typings";
import { debug } from "./log";

const CONFIGS = import.meta.globEager("../../*/playground.ts");

export interface AppGroup {
  url: string;
  kind: string;
  configs: AddAppParams[];
}

export async function registerApps(): Promise<AppGroup[]> {
  const apps = Object.entries(CONFIGS).map(([path, m]) => {
    const name = (/^(?:\.\.\/){2}([^/]+)/.exec(path) || ["", ""])[1];
    const url = `https://github.com/netless-io/netless-app/tree/master/packages/${name}`;
    const configs: PlaygroundConfigs = Array.isArray(m.default) ? m.default : [m.default];
    const kind = configs[0].kind;
    debug("[register]", kind);

    const app: AppGroup = { kind, url, configs: [] };
    for (const { kind, src, ...rest } of configs) {
      const wrapped = async () => {
        if (typeof src === "function") {
          const mod = await src();
          return "default" in mod ? mod.default : mod;
        } else {
          return src;
        }
      };
      WindowManager.register({ kind, src: wrapped });
      app.configs.push({ kind, ...rest });
    }

    return app;
  });

  window.apps = apps;
  return apps;
}
