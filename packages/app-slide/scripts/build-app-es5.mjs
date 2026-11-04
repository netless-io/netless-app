import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const leaf = createRequire(path.join(root, "package.json"));
const tools = process.env.ES5_BUILD_TOOLS_DIR
  ? createRequire(path.join(path.resolve(process.env.ES5_BUILD_TOOLS_DIR), "package.json"))
  : leaf;
const babel = tools("@babel/standalone"),
  acorn = tools("acorn"),
  esbuild = tools("esbuild"),
  terser = tools("terser");
const output = path.join(root, "dist-app"),
  filename = path.join(output, "main.iife.js");
const app = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const slideEntry = process.env.SLIDE_CANDIDATE_DIR
  ? path.resolve(process.env.SLIDE_CANDIDATE_DIR, "lib/Slide.js")
  : leaf.resolve("@netless/slide");
const slide = JSON.parse(
  await fs.readFile(path.join(path.dirname(slideEntry), "../package.json"), "utf8")
);
const before = await fs.readFile(filename, "utf8");
const polyfillBuild = await esbuild.build({
  stdin: {
    contents:
      'import "core-js/stable"; import "whatwg-fetch"; import {AbortController, AbortSignal} from "abort-controller/dist/abort-controller.mjs"; if(typeof globalThis.AbortController === "undefined") { globalThis.AbortController=AbortController; globalThis.AbortSignal=AbortSignal; }',
    resolveDir: process.env.ES5_BUILD_TOOLS_DIR
      ? path.resolve(process.env.ES5_BUILD_TOOLS_DIR)
      : root,
    sourcefile: "mobile-polyfills.js",
  },
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2015",
  write: false,
});
const transformOptions = {
  filename: "main.iife.js",
  sourceType: "script",
  babelrc: false,
  configFile: false,
  presets: [
    [
      "env",
      { targets: { ie: "11" }, modules: false, useBuiltIns: false, forceAllTransforms: true },
    ],
  ],
  comments: true,
  compact: false,
};
const result = babel.transform(polyfillBuild.outputFiles[0].text + "\n" + before, transformOptions);
// Keep Babel helpers private; export only the documented app namespace.
const isolated =
  "(function(root){\n" +
  result.code +
  '\nroot.NetlessAppSlide=NetlessAppSlide;\n})(typeof globalThis!=="undefined"?globalThis:typeof self!=="undefined"?self:this);';
const compact = await terser.minify(isolated, {
  ecma: 5,
  compress: { ecma: 5, arrows: false },
  mangle: { toplevel: false },
  format: { ecma: 5, comments: /^!|@license|@preserve/ },
});
if (!compact.code) throw Error("ES5 minifier produced no code");
acorn.parse(compact.code, { ecmaVersion: 5, sourceType: "script" });
await fs.writeFile(filename, compact.code + "\n");
const polyfillES5 = babel.transform(polyfillBuild.outputFiles[0].text, transformOptions);
const compat = await terser.minify("(function(){" + polyfillES5.code + "})();", {
  ecma: 5,
  compress: { ecma: 5, arrows: false },
  format: { ecma: 5, comments: /^!|@license|@preserve/ },
});
if (!compat.code) throw Error("Polyfill build produced no code");
acorn.parse(compat.code, { ecmaVersion: 5, sourceType: "script" });
await fs.writeFile(path.join(output, "compat.js"), compat.code + "\n");
await fs.copyFile(path.join(root, "dist/index.d.ts"), path.join(output, "index.d.ts"));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const manifest = {
  appVersion: app.version,
  slideVersion: slide.version,
  slideArtifact: process.env.SLIDE_CANDIDATE_DIR ? "local-unreleased-candidate" : "installed-npm",
  slideSHA256: hash(await fs.readFile(slideEntry)),
  appSHA256: hash(await fs.readFile(filename)),
  bytes: (await fs.stat(filename)).size,
  format: "iife",
  global: "NetlessAppSlide",
  ecmaVersion: 5,
  backendOption: {},
  defaultAudioBackend: "html5",
  supportsAudioBackendOverride: true,
  sharedMediaVolumeDefault: false,
  defaultVolume: 0.5,
  compatSHA256: hash(await fs.readFile(path.join(output, "compat.js"))),
  polyfills: ["core-js/stable", "fetch when absent", "AbortController/AbortSignal when absent"],
  tools: Object.fromEntries(
    [
      "@babel/standalone",
      "acorn",
      "esbuild",
      "terser",
      "core-js",
      "abort-controller",
      "whatwg-fetch",
    ].map(name => [name, tools(name + "/package.json").version])
  ),
};
await fs.writeFile(path.join(output, "artifact.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest));
