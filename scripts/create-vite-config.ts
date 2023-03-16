// import peerDepsExternal from "rollup-plugin-peer-deps-external";
import excludeDependencies from "rollup-plugin-exclude-dependencies-from-bundle";
import type { LibraryFormats, Plugin, UserConfigFn } from "vite";
import { defineConfig } from "vite";
import { readFileSync, existsSync } from "fs";
import path from "path";
import esbuild from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";
import autoprefixer from "autoprefixer";
import postcssrc from 'postcss-load-config';
import SASS from "sass";

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
        formats.includes("iife") && iife(entry, name || "Netless" + varName),
      ],
      build: {
        lib: {
          entry,
          formats: formats.filter(e => e !== "iife"),
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

function iife(entry: string, globalName: string): Plugin {
  let mode = "development";
  return {
    name: "iife",
    configResolved(config) {
      mode = config.mode;
    },
    async closeBundle() {
      const { svelte } = await import("@hyrious/esbuild-plugin-svelte")
      let options: postcssrc.Result | undefined;
      try {
        options = await postcssrc({}, path.dirname(entry));
      } catch {}
      const loader: Record<string, esbuild.Loader> = {
        '.woff2': 'dataurl',
        '.woff': 'dataurl',
        '.ttf': 'dataurl',
        '.eot': 'dataurl',
        '.svg': 'dataurl',
      };
      await esbuild.build({
        entryPoints: [entry],
        outfile: "dist/main.iife.js",
        bundle: true,
        globalName,
        minify: mode === "production",
        legalComments: "none",
        logLevel: "info",
        define: {
          "import.meta.env.DEV": "false",
        },
        loader,
        plugins: [
          svelte(),
          {
            name: "inline-css",
            setup({ onResolve, onLoad }) {
              const processor = options && postcss(options.plugins);

              onResolve({ filter: /\?inline$/ }, async args => {
                const file = path.join(args.resolveDir, args.path.slice(0, args.path.indexOf("?")));

                const r = await esbuild.build({
                  entryPoints: [file],
                  bundle: true,
                  minify: mode === "production",
                  write: false,
                  logLevel: "silent",
                  loader,
                  plugins: [
                    {
                      name: "postcss",
                      setup({ onLoad }) {
                        if (processor) {
                          onLoad({ filter: /\.css$/ }, async args => {
                            const input = readFileSync(args.path, "utf8");
                            const result = await processor.process(input, { from: args.path });
                            return { contents: result.css, loader: "css" };
                          });
                        }

                        onLoad({ filter: /\.scss$/ }, async args => {
                          const { css } = SASS.compile(args.path, {
                            style: "compressed",
                          });
                          return { contents: css, loader: "css" };
                        });
                      },
                    },
                  ],
                });

                const contents =
                  `const css = ${JSON.stringify(r.outputFiles[0].text)};\n` +
                  `const style = document.createElement("style");\n` +
                  `style.appendChild(document.createTextNode(css));\n` +
                  `document.head.appendChild(style);\n`;
                return { path: args.path, namespace: "inline-css", pluginData: contents };
              });

              onLoad({ filter: /./, namespace: "inline-css" }, args => {
                return { contents: args.pluginData, loader: "js" };
              });
            },
          },
        ],
      });
    },
  };
}
