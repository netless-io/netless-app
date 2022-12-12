// import peerDepsExternal from "rollup-plugin-peer-deps-external";
import excludeDependencies from "rollup-plugin-exclude-dependencies-from-bundle";
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

export function createViteConfig({
  entry = path.resolve(process.cwd(), "src/index.ts"),
  name,
  formats = ["es", "cjs", "iife"],
  minify,
}: {
  entry?: string;
  name?: string;
  formats?: LibraryFormats[];
  minify?: boolean;
} = {}): UserConfigFn {
  return defineConfig(async ({ mode }) => {
    // https://github.com/sveltejs/vite-plugin-svelte/blob/main/docs/faq.md#how-can-i-use-vite-plugin-svelte-from-commonjs
    const { svelte, vitePreprocess } = await import("@sveltejs/vite-plugin-svelte");

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
      esbuild: {
        target: "esnext",
      },
      plugins: [
        svelte({
          emitCss: false,
          preprocess: vitePreprocess(),
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
          plugins: [excludeDependencies() as Plugin],
        },
        minify: minify ?? isProd,
      },
    };
  }) as UserConfigFn;
}
