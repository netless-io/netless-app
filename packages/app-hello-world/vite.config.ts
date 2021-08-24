import { defineConfig } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const isProd = mode === "production";

  return {
    build: {
      lib: {
        entry: path.resolve(__dirname, "src/index.ts"),
        formats: ["es", "cjs"],
        fileName: "main",
        name: "NetlessAppHelloWorld",
      },
      sourcemap: isProd,
      outDir: "dist",
      rollupOptions: {
        external: ["@netless/window-manager"],
      },
      minify: isProd,
    },
  };
});
