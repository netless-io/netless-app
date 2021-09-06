import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [
    svelte({
      emitCss: false,
      experimental: {
        useVitePreprocess: true,
      },
    }),
  ],
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
