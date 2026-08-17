const assert = require("assert");
const fs = require("fs");
const ts = require("typescript");

const originalTypeScriptExtension = require.extensions[".ts"];
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2018,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { releaseAndRestoreSlide } = require("../src/SlideController/recovery.ts");

if (originalTypeScriptExtension) {
  require.extensions[".ts"] = originalTypeScriptExtension;
} else {
  delete require.extensions[".ts"];
}

async function run() {
  const events = [];
  let completeRelease;
  let completeRestore;
  let latestState = { page: 1 };
  const slide = {
    release: callback => {
      events.push("release:start");
      completeRelease = callback;
    },
    setSlideState: state => {
      events.push(`restore:${state.page}`);
      return new Promise(resolve => {
        completeRestore = () => {
          events.push("restore:complete");
          resolve();
        };
      });
    },
  };

  const recovery = releaseAndRestoreSlide(
    slide,
    () => {
      events.push("storage:read");
      return latestState;
    },
    state => events.push(`storage:apply:${state.page}`)
  );

  assert.deepStrictEqual(events, ["release:start"]);
  latestState = { page: 3 };
  completeRelease();

  let recoveryCompleted = false;
  recovery.then(() => {
    recoveryCompleted = true;
  });
  await Promise.resolve();

  assert.deepStrictEqual(events, ["release:start", "storage:read", "storage:apply:3", "restore:3"]);
  assert.strictEqual(recoveryCompleted, false);

  completeRestore();
  await recovery;

  assert.strictEqual(recoveryCompleted, true);
  assert.deepStrictEqual(events, [
    "release:start",
    "storage:read",
    "storage:apply:3",
    "restore:3",
    "restore:complete",
  ]);

  console.log("app-slide recovery tests passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
