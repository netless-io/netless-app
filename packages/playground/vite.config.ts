import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "",
  define: {
    __APP_VERSION__: "undefined",
  },
  esbuild: {
    target: "esnext",
    jsxFactory: "h",
    jsxFragment: "Fragment",
  },
  plugins: [
    svelte({
      emitCss: false,
      hot: false,
      experimental: {
        useVitePreprocess: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        embed: resolve(__dirname, "embed.html"),
      },
    },
  },
});
