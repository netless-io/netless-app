import { build } from "esbuild";
import { resolve } from "node:path";
import { createRequire } from "node:module";

await build({
  entryPoints: ["test/RuntimeActivity.test.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "test/.cache/RuntimeActivity.test.js",
  define: { "import.meta.env.DEV": "false" },
  plugins: [
    {
      name: "slide-engine-stub",
      setup(build) {
        build.onResolve({ filter: /^@netless\/slide$/ }, () => ({
          path: resolve("test/slide-engine-stub.ts"),
        }));
      },
    },
  ],
});
createRequire(import.meta.url)("./.cache/RuntimeActivity.test.js");
