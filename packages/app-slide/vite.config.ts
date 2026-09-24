import { createViteConfig } from "../../scripts/create-vite-config";
import { readFileSync } from "fs";
import path from "path";

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
  const config = createViteConfig()(env);
  return {
    ...config,
    resolve: candidate ? { alias: { "@netless/slide": entry } } : undefined,
    build: {
      ...config.build,
      commonjsOptions: {
        include: [/node_modules/, /\/slide\/lib\/Slide\.js$/],
        transformMixedEsModules: true,
      },
    },
  };
};
