import { rollup } from "rollup";
import dts from "rollup-plugin-dts";
import ts from "typescript";
import fs from "fs";

const { peerDependencies } = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")
);
const compilerOptions = {
  noEmit: true,
  strict: true,
  isolatedModules: true,
  noFallthroughCasesInSwitch: true,
  forceConsistentCasingInFileNames: true,
  noUnusedParameters: true,
  noImplicitOverride: true,
  module: "ESNext",
  lib: ["DOM", "ESNext"],
  types: ["vite/client", "svelte", "typings"],
  moduleResolution: "Node",
  esModuleInterop: true,
  resolveJsonModule: true,
  skipLibCheck: true,
};

const start = Date.now();

const bundle = await rollup({
  input: "./src/index.ts",
  output: { file: "index.d.ts" },
  plugins: [
    dts({
      respectExternal: true,
      compilerOptions: {
        ...ts.parseJsonConfigFileContent({ compilerOptions }, ts.sys, ".").options,
        declaration: true,
        noEmit: false,
        emitDeclarationOnly: true,
        noEmitOnError: true,
        checkJs: false,
        declarationMap: false,
        skipLibCheck: true,
        preserveSymlinks: false,
      },
    }),
  ],
  external: Object.keys({
    ...peerDependencies,
    "@netless/window-manager": "*",
    "white-web-sdk": "*",
  }),
});

const result = await bundle.write({
  dir: "dist",
  format: "esm",
  exports: "named",
});

console.log(
  `Built ${result.output.map(e => e.fileName).join(", ")} in ${Math.floor(Date.now() - start)}ms`
);
