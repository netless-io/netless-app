import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  base: "",
  plugins: [
    svelte({
      emitCss: false,
      experimental: {
        useVitePreprocess: true,
      },
    }),
  ],
});
