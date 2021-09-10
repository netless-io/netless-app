import { svelte } from "@sveltejs/vite-plugin-svelte";
import type { LibraryFormats, UserConfig } from "vite";
import { defineConfig } from "vite";
import path from "path";

export function createViteConfig({
  entry = path.resolve(process.cwd(), "src/index.ts"),
  name,
}: {
  entry?: string;
  name?: string;
} = {}): UserConfig {
  return defineConfig(({ mode }) => {
    const isProd = mode === "production" || mode === "iife";
    const pkgName = (entry.match(/packages[/\\]([^/\\]+)/) || ["", ""])[1];

    if (!pkgName) {
      throw new Error(`can not find package from ${entry}`);
    }

    const varName = pkgName
      .split(/-+/)
      .map((e: string) => e[0].toUpperCase() + e.slice(1))
      .join("");

    const config = {
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
          entry,
          formats: ["es", "cjs"] as LibraryFormats[],
          fileName: "main",
          name: name || "Netless" + varName,
        },
        sourcemap: isProd,
        outDir: "dist",
        rollupOptions: {
          external: ["@netless/window-manager"],
          output: { manualChunks: undefined, inlineDynamicImports: false },
        },
        minify: isProd,
      },
    };

    if (mode === "iife") {
      config.build.lib.formats = ["iife"];
      config.build.rollupOptions.output.inlineDynamicImports = true;
    }

    return config;
  }) as UserConfig;
}
