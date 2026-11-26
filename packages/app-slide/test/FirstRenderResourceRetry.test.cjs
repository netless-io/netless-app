const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { transformSync } = require("esbuild");

const code = transformSync(readFileSync("src/index.ts", "utf8"), {
  loader: "ts",
  format: "cjs",
  define: { "import.meta.env.DEV": "false", __APP_VERSION__: '"test"' },
}).code;

async function testFirstRender(errorType) {
  let destroyed = false;
  let onDestroy;
  const reports = [];
  const appModule = { exports: {} };
  const noop = () => undefined;
  const renderError = Object.assign(new Error("first page failed"), { errorType });
  const retries = [];
  class SlideController {
    constructor(options) {
      this.ready = false;
      this.readyPromise = new Promise(() => undefined);
      this.slide = { doRenderSlide: async index => { retries.push(index); } };
      queueMicrotask(() => options.onRenderError(renderError, 1));
    }
  }
  class SlideDocsViewer {
    constructor(options) { this.options = options; }
    setSyncEventQueuePolicy() {}
    setJustSildeReadonly() {}
    mount() { this.slideController = this.options.mountSlideController({ onReady: noop }); }
    destroy() { destroyed = true; }
  }
  const imports = {
    "@netless/slide": { Slide: { usePlugin: noop } },
    "side-effect-manager": require("side-effect-manager"),
    "./SlideController": {
      SlideController,
      enqueueSlideWebGLTransition: async run => run(),
    },
    "./SlideDocsViewer": { SlideDocsViewer },
    "./utils/freezer": {},
    "./utils/logger": {
      log: noop,
      setRoomLogger: noop,
      logger: { setAppContext: noop, setAppController: noop, deleteApp: noop, warn: noop },
    },
    "./style.scss?inline": "",
    "./SlidePreviewer": {},
    "./DocsViewer": {},
  };
  new Function("module", "exports", "require", "window", code)(appModule, appModule.exports, name => {
    assert.ok(name in imports, name);
    return imports[name];
  }, globalThis);
  const context = {
    appId: "test-app",
    storage: { state: { taskId: "fixture" } },
    getIsWritable: () => false,
    getView: () => ({}),
    getWindowManager: () => ({ lazySetupInMaximizedMode: true }),
    getBox: () => ({ mountStyles: noop, $content: { dataset: {} } }),
    getInitScenePath: () => "/fixture",
    getAppOptions: () => ({ setupReadyTimeout: 50, onRenderError: (...args) => reports.push(args) }),
    getRoom: () => undefined,
    mountView: noop,
    waitForActualSetupReady: true,
    emitter: { on: (event, callback) => {
      if (event === "destroy") onDestroy = callback;
      return noop;
    } },
  };
  const setup = appModule.exports.default.setup(context);
  if (errorType === "RESOURCE_ERROR") {
    const result = await setup;
    assert.equal(destroyed, false);
    await result.slide().doRenderSlide(1);
    assert.deepEqual(retries, [1]);
    await onDestroy();
  } else {
    await assert.rejects(setup, /first render failed before ready/);
  }
  assert.deepEqual(reports, [[renderError, 1]]);
  assert.equal(destroyed, true);
}

(async () => {
  await testFirstRender("RESOURCE_ERROR");
  await testFirstRender("RUNTIME_ERROR");
  console.log("app-slide first render resource recovery passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
