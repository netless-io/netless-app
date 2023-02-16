import { svelte } from "@sveltejs/vite-plugin-svelte";
import peerDepsExternal from "rollup-plugin-peer-deps-external";
import type { LibraryFormats, Plugin, UserConfigFn } from "vite";
import { defineConfig } from "vite";
import { existsSync } from "fs";
import path from "path";

function findPackageJSON(entry: string): { version: string } | undefined {
  const dir = path.dirname(entry);
  if (dir === entry) return;
  const file = path.resolve(dir, "package.json");
  if (existsSync(file)) return require(file);
  return findPackageJSON(dir);
}

interface Options {
  entry?: string;
  name?: string;
  formats?: LibraryFormats[];
}

export function createViteConfig({
  entry = path.resolve(process.cwd(), "src/index.ts"),
  name,
  formats = ["es", "cjs", "iife"],
}: Options = {}): UserConfigFn {
  return defineConfig(({ mode }) => {
    const isProd = mode === "production";
    const pkgName = (entry.match(/packages[/\\]([^/\\]+)/) || ["", ""])[1];

    if (!pkgName) {
      throw new Error(`can not find package from ${entry}`);
    }

    const varName = pkgName
      .split(/-+/)
      .map((e: string) => e[0].toUpperCase() + e.slice(1))
      .join("");

    const pkg = findPackageJSON(entry);

    return {
      define: {
        __APP_VERSION__: pkg ? JSON.stringify(pkg.version) : "undefined",
      },
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
          formats,
          fileName: "main",
          name: name || "Netless" + varName,
        },
        sourcemap: isProd,
        outDir: "dist",
        rollupOptions: {
          external: ["@netless/window-manager"],
          output: {
            manualChunks: undefined,
            inlineDynamicImports: true,
            exports: "named",
          },
          plugins: [peerDepsExternal() as Plugin],
        },
        minify: isProd,
      },
    };
  }) as UserConfigFn;
}
