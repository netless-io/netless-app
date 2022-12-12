import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  // https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/faq.md#how-can-i-use-vite-plugin-svelte-from-commonjs
  const { svelte, vitePreprocess } = await import("@sveltejs/vite-plugin-svelte");

  return {
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
        preprocess: vitePreprocess(),
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
  };
});
