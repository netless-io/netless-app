import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(process.cwd(), "src/index.ts"),
      formats: ["es", "cjs", "iife"],
      fileName: "main",
      name: "MyApp",
    },
    outDir: "dist",
    rollupOptions: {
      external: ["@netless/window-manager"],
      output: { manualChunks: undefined },
    },
    minify: true,
    sourcemap: true,
  },
});
