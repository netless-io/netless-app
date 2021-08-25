import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import path from "path";

export function createViteConfig({
  entry = path.resolve(process.cwd(), "src/index.ts"),
  name,
}: {
  entry?: string;
  name?: string;
} = {}) {
  return defineConfig(({ mode }) => {
    const isProd = mode === "production";
    const pkgName = (entry.match(/packages[\/\\]([^\/\\]+)/) || [, ""])[1];

    if (!pkgName) {
      throw new Error(`can not find package from ${entry}`);
    }

    const varName = pkgName
      .split(/-+/)
      .map((e: string) => e[0].toUpperCase() + e.slice(1))
      .join("");

    return {
      plugins: [svelte()],
      build: {
        lib: {
          entry,
          formats: ["es", "cjs"],
          fileName: "main",
          name: name || "Netless" + varName,
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
}
