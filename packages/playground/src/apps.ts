import type { AddAppParams, RegisterParams } from "@netless/window-manager";
import { WindowManager } from "@netless/window-manager";

import type { PlaygroundConfigs } from "../typings";
import { log } from "./log";

const CONFIGS = import.meta.globEager("../../*/playground.(ts|js)");

export interface AppGroup {
  url: string;
  kind: string;
  configs: (AddAppParams & { getAttributes?: () => Record<string, unknown> | null | undefined })[];
}

export function registerApps(): AppGroup[] {
  const registered = new Set<string>();
  const registerApp = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    src: any,
    kind: string,
    appOptions: Record<string, unknown> | undefined,
    addHooks: RegisterParams["addHooks"]
  ) => {
    const wrapped = async () => {
      if (typeof src === "function") {
        const mod = await src();
        return "default" in mod ? mod.default : mod;
      } else {
        return src;
      }
    };
    const params: RegisterParams = {
      kind,
      appOptions: { debug: true, ...appOptions },
      src: wrapped,
      addHooks,
    };
    log("[register]", params.kind, params.appOptions);
    WindowManager.register(params);
  };

  const apps = Object.entries(CONFIGS).map(([path, m]) => {
    const name = (/^(?:\.\.\/){2}([^/]+)/.exec(path) || ["", ""])[1];
    const url = `https://github.com/netless-io/netless-app/tree/master/packages/${name}`;
    const configs: PlaygroundConfigs = Array.isArray(m.default) ? m.default : [m.default];
    const kind = configs[0].kind;

    const app: AppGroup = { kind, url, configs: [] };
    for (const { kind, src, appOptions, addHooks, ...rest } of configs) {
      if (!registered.has(kind)) {
        registered.add(kind);
        registerApp(src, kind, appOptions, addHooks);
      }
      app.configs.push({ kind, ...rest });
    }

    return app;
  });

  window.apps = apps;
  return apps;
}
