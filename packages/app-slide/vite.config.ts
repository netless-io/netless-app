import { createViteConfig } from "../../scripts/create-vite-config";
import { readFileSync } from "fs";
import path from "path";
import type { LibraryFormats } from "vite";

export default (env: Parameters<ReturnType<typeof createViteConfig>>[0]) => {
  const candidate = process.env.SLIDE_CANDIDATE_DIR;
  const entry = candidate
    ? path.resolve(candidate, "lib/Slide.js")
    : require.resolve("@netless/slide");
  const declarations = readFileSync(path.join(path.dirname(entry), "Slide.d.ts"), "utf8");
  if (!declarations.includes("export interface SyncEventOrigin")) {
    throw new Error(
      "app-slide scene synchronization requires Slide PR #254 (renderEnd/stateChange origins). " +
        "Install a release containing it, or set SLIDE_CANDIDATE_DIR to the built Slide package for local validation."
    );
  }
  if (
    !declarations.includes("enableSharedMediaVolume?") ||
    !declarations.includes("applySharedMediaVolume(")
  ) {
    throw new Error(
      "app-slide requires Slide's opt-in shared volume and host authority APIs. " +
        "Install the matching release or use SLIDE_CANDIDATE_DIR for candidate validation."
    );
  }
  const config = createViteConfig()(env);
  const appBuild = env.mode === "app";
  return {
    ...config,
    resolve: candidate ? { alias: { "@netless/slide": entry } } : undefined,
    build: {
      ...config.build,
      ...(appBuild
        ? {
            outDir: "dist-app",
            lib: { ...(config.build?.lib || {}), formats: ["iife"] as LibraryFormats[] },
            minify: false,
            sourcemap: false,
            rollupOptions: {
              ...config.build?.rollupOptions,
              // A native IIFE cannot leave optional peers as dynamic imports.
              plugins: [],
            },
          }
        : {}),
      commonjsOptions: {
        include: [/node_modules/, /\/lib\/Slide\.js$/],
        transformMixedEsModules: true,
      },
    },
  };
};
