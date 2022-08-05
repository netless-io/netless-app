import { createViteConfig } from "../../scripts/create-vite-config";

import { resolve } from "path";
import type { UserConfig } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const configFn = defineConfig(options => {
  const config = createViteConfig({ entry: resolve("./src/index.tsx") })(options) as UserConfig;
  config.plugins = [react()];
  Object.assign(config, {
    esbuild: {},
  });
  return config;
});

export default configFn;
