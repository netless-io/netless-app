const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const ts = require("typescript");

// Load real entry points; stub only browser/rendering dependencies, not lifecycle methods.
function loadSource(relative, mocks) {
  const filename = path.resolve(__dirname, "..", relative);
  const source = fs.readFileSync(filename, "utf8").replaceAll("import.meta.env.DEV", "false");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const requireFromSource = createRequire(filename);
  new Function("require", "module", "exports", "__APP_VERSION__", code)(
    request => (request in mocks ? mocks[request] : requireFromSource(request)),
    module,
    module.exports,
    "test"
  );
  return module.exports;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
}

class BrowserClock {
  nextId = 0;
  timers = new Map();
  frames = new Map();
  install(withRAF = true) {
    const overrides = {
      setTimeout: (fn, ms) => this.addTimer(fn, ms, false),
      setInterval: (fn, ms) => this.addTimer(fn, ms, true),
      clearTimeout: id => this.timers.delete(id),
      clearInterval: id => this.timers.delete(id),
      requestAnimationFrame: withRAF
        ? fn => {
            const id = ++this.nextId;
            this.frames.set(id, fn);
            return id;
          }
        : undefined,
      cancelAnimationFrame: id => this.frames.delete(id),
    };
    overrides.window = { ...overrides, ResizeObserver: class {} };
    const originals = Object.fromEntries(
      Object.keys(overrides).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
    );
    Object.assign(globalThis, overrides);
    return () => {
      for (const [key, descriptor] of Object.entries(originals)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    };
  }
  addTimer(fn, ms, interval) {
    const id = ++this.nextId;
    this.timers.set(id, { fn, ms, interval });
    return id;
  }
  timer(ms) {
    const entry = [...this.timers].find(([, timer]) => timer.ms === ms);
    assert.ok(entry, `missing ${ms}ms timer`);
    const [id, timer] = entry;
    if (!timer.interval) this.timers.delete(id);
    timer.fn();
  }
  frame() {
    const frames = [...this.frames.values()];
    this.frames.clear();
    frames.forEach(fn => fn());
  }
  assertEmpty() {
    assert.equal(this.timers.size, 0, "timer leaked");
    assert.equal(this.frames.size, 0, "frame callback leaked");
  }
}

function context(options = {}, isStatic = false) {
  const listeners = new Map();
  return {
    appId: "test-app",
    storage: { state: { taskId: "test-task" } },
    getIsWritable: () => false,
    getView: () => ({}),
    getBox: () => ({ mountStyles() {}, $content: { dataset: {}, querySelector: () => null } }),
    getWindowManager: () => ({ lazySetupInMaximizedMode: true }),
    getAppOptions: () => options,
    getInitScenePath: () => "/test",
    getRoom: () => undefined,
    getAttributes: () => ({}),
    getScenes: () => [{ ppt: { src: isStatic ? "https://example.test/page.png" : "ppt://test" } }],
    mountView() {},
    dispatchAppEvent() {},
    emitter: {
      on(name, listener) {
        listeners.set(name, listener);
        return () => listeners.delete(name);
      },
    },
    listeners,
  };
}

async function testAppTeardown(rejectDestroy) {
  const clock = new BrowserClock();
  const restore = clock.install();
  try {
    const pending = deferred();
    let calls = 0;
    const app = loadSource("packages/app-slide/src/index.ts", {
      "@netless/slide": { Slide: { usePlugin() {} } },
      "./style.scss?inline": "",
      "./SlideController": { enqueueSlideWebGLTransition: run => Promise.resolve().then(run) },
      "./SlidePreviewer": {},
      "./DocsViewer": {},
      "./utils/freezer": { useFreezer: false },
      "./utils/logger": { log() {}, logger: { setAppContext() {}, setAppController() {}, deleteApp() {} } },
      "./SlideDocsViewer": {
        SlideDocsViewer: class {
          setSyncEventQueuePolicy() {}
          setJustSildeReadonly() {}
          mount() {}
          destroy() {
            calls += 1;
            return pending.promise;
          }
        },
      },
    }).default;
    const ctx = context();
    const setup = assert.rejects(app.setup(ctx), /disposed before first render/);
    const destroyListener = ctx.listeners.get("destroy");
    let secondDone = false,
      eventDone = false;
    const expected = new Error("destroy failed");
    const observe = (promise, done) =>
      promise.then(
        () => {
          assert.equal(rejectDestroy, false);
          done();
        },
        error => {
          assert.equal(error, expected);
          done();
        }
      );
    const event = observe(destroyListener(), () => {
      eventDone = true;
    });
    await flush();
    const second = observe(destroyListener(), () => {
      secondDone = true;
    });
    await flush();
    assert.equal(calls, 1);
    assert.equal(secondDone || eventDone, false);
    if (rejectDestroy) pending.reject(expected);
    else pending.resolve();
    await flush();
    assert.equal(secondDone && eventDone, true);
    await Promise.all([second, event]);
    await setup;
    assert.equal(ctx.listeners.has("destroy"), false);
    clock.assertEmpty();
  } finally {
    restore();
  }
}

async function testFailedFirstRenderCleansBeforeRetry(mode) {
  const clock = new BrowserClock();
  const restore = clock.install();
  try {
    const controllers = [];
    const viewers = [];
    const firstDestroy = deferred();
    const app = loadSource("packages/app-slide/src/index.ts", {
      "@netless/slide": { Slide: { usePlugin() {} } },
      "./style.scss?inline": "",
      "./SlideController": {
        enqueueSlideWebGLTransition: run => Promise.resolve().then(run),
        SlideController: class {
          constructor(options) {
            this.options = options;
            this.readyDeferred = deferred();
            this.readyPromise = this.readyDeferred.promise;
            this.slide = { slideState: { currentSlideIndex: 1 }, on() {} };
            this.ready = false;
            controllers.push(this);
          }
        },
      },
      "./SlidePreviewer": {},
      "./DocsViewer": {},
      "./utils/freezer": { useFreezer: false },
      "./utils/logger": { log() {}, logger: { setAppContext() {}, setAppController() {}, deleteApp() {}, warn() {} } },
      "./SlideDocsViewer": {
        SlideDocsViewer: class {
          constructor(options) {
            this.options = options;
            viewers.push(this);
          }
          setSyncEventQueuePolicy() {}
          setJustSildeReadonly() {}
          mount() {
            this.slideController = this.options.mountSlideController({
              onReady() {}, onRenderEnd() {}, onNavigate() {},
            });
          }
          destroy() {
            this.destroyCalls = (this.destroyCalls || 0) + 1;
            return viewers.length === 1 ? firstDestroy.promise : Promise.resolve();
          }
        },
      },
    }).default;
    const ctx = context();
    assert.equal(app.teardown, undefined, "Slide must not advertise runtime eviction");
    const first = assert.rejects(app.setup(ctx), /first render failed/);
    await flush();
    if (mode === "render-error") {
      controllers[0].options.onRenderError(new Error("render failed"), 1);
      controllers[0].readyDeferred.resolve();
    } else {
      controllers[0].readyDeferred.reject(new Error("load failed"));
    }
    await flush();
    assert.equal(viewers[0].destroyCalls, 1);
    assert.equal(ctx.listeners.has("destroy"), false);
    let rejected = false;
    first.then(() => { rejected = true; });
    await flush();
    assert.equal(rejected, false, "setup failure waits for viewer destruction");
    firstDestroy.resolve();
    await first;

    const retry = app.setup(ctx);
    await flush();
    controllers[1].ready = true;
    controllers[1].readyDeferred.resolve();
    await retry;
    assert.equal(viewers.length, 2);
    assert.equal(viewers[1].destroyCalls, undefined, "retry keeps its new runtime alive");
    await ctx.listeners.get("destroy")();
    assert.equal(viewers[1].destroyCalls, 1);
    clock.assertEmpty();
  } finally {
    restore();
  }
}

async function testPendingSetupDoesNotMountAfterDestroy() {
  const clock = new BrowserClock();
  const restore = clock.install();
  try {
    const gate = deferred();
    let mounts = 0;
    let destroys = 0;
    const app = loadSource("packages/app-slide/src/index.ts", {
      "@netless/slide": { Slide: { usePlugin() {} } },
      "./style.scss?inline": "",
      "./SlideController": {
        enqueueSlideWebGLTransition: run => gate.promise.then(run),
      },
      "./SlidePreviewer": {},
      "./DocsViewer": {},
      "./utils/freezer": { useFreezer: false },
      "./utils/logger": { log() {}, logger: { setAppContext() {}, deleteApp() {} } },
      "./SlideDocsViewer": {
        SlideDocsViewer: class {
          setSyncEventQueuePolicy() {}
          setJustSildeReadonly() {}
          mount() { mounts++; }
          destroy() { destroys++; return Promise.resolve(); }
        },
      },
    }).default;
    const ctx = context();
    const setup = assert.rejects(app.setup(ctx), /disposed before first render/);
    await ctx.listeners.get("destroy")();
    assert.equal(destroys, 1);
    gate.resolve();
    await setup;
    assert.equal(mounts, 0, "closed pending setup must not create a player");
    clock.assertEmpty();
  } finally {
    restore();
  }
}

async function testViewerTeardown(rejectDestroy) {
  const clock = new BrowserClock();
  const restore = clock.install();
  try {
    const { SlideDocsViewer } = loadSource("packages/app-slide/src/SlideDocsViewer/index.ts", {
      "../SlideController": {},
      "../DocsViewer": {},
      "../DocsViewer/ResizableContainer": {},
      "./navigation": {},
      "../utils/logger": {},
      "../utils/helpers": {},
      "@juggle/resize-observer": {},
    });
    const viewer = Object.create(SlideDocsViewer.prototype);
    const pending = deferred();
    const counts = { controller: 0, unmount: 0, container: 0, destroy: 0, flush: 0 };
    Object.assign(viewer, {
      slideController: {
        destroy() {
          counts.controller++;
          return pending.promise;
        },
      },
      viewer: {
        unmount() {
          counts.unmount++;
        },
        destroy() {
          counts.destroy++;
        },
      },
      resizableContainer: {
        destroy() {
          counts.container++;
        },
      },
      sideEffect: {
        flushAll() {
          counts.flush++;
        },
      },
    });
    const unmount = viewer.unmount();
    const destroy = viewer.destroy();
    assert.equal(viewer.unmount(), unmount);
    assert.equal(viewer.destroy(), destroy);
    const expected = new Error("controller failed");
    let settled = false;
    const result = rejectDestroy
      ? Promise.all([
          assert.rejects(unmount, error => error === expected),
          assert.rejects(destroy, error => error === expected),
        ])
      : Promise.all([unmount, destroy]);
    result.then(() => {
      settled = true;
    });
    await flush();
    assert.equal(settled, false);
    assert.deepEqual(counts, { controller: 1, unmount: 0, container: 0, destroy: 0, flush: 1 });
    if (rejectDestroy) pending.reject(expected);
    else pending.resolve();
    await flush();
    assert.equal(settled, true);
    await result;
    assert.equal(viewer.destroy(), destroy);
    assert.equal(viewer.unmount(), unmount);
    if (!rejectDestroy)
      assert.deepEqual(counts, { controller: 1, unmount: 1, container: 1, destroy: 1, flush: 1 });
  } finally {
    restore();
  }
}

async function testDocsReady(mode) {
  const clock = new BrowserClock();
  const restore = clock.install(mode !== "no-raf" && mode !== "cancel-no-raf");
  try {
    let destroyed = 0;
    class Viewer {
      viewer = { pageIndex: 0 };
      mount() {
        return this;
      }
      getPageIndex() {
        return 0;
      }
      destroy() {
        destroyed++;
      }
    }
    const app = loadSource("packages/app-docs-viewer/src/index.ts", {
      "./style.scss?inline": "",
      "./constants": { kind: "DocsViewer" },
      "./DynamicDocsViewer": { DynamicDocsViewer: Viewer },
      "./StaticDocsViewer": { StaticDocsViewer: Viewer },
    }).default;
    const ctx = context({ setupReadyTimeout: 250 }, mode === "static-timeout");
    let ready = false;
    const setup = app.setup(ctx).then(() => {
      ready = true;
    });
    await flush();
    assert.equal(ready, false);
    const lateFrame = [...clock.frames.values()][0];
    if (mode === "timeout" || mode === "static-timeout") {
      clock.timer(250);
    } else if (mode === "cancel" || mode === "cancel-no-raf") {
      // Both destroy-event and direct teardown entry points settle setup.
      if (mode === "cancel") ctx.listeners.get("destroy")();
      else app.teardown(ctx);
    } else {
      if (mode === "no-raf") clock.timer(50);
      else clock.frame();
      await flush();
      assert.equal(ready, false, "must wait for both frames");
      if (mode === "no-raf") clock.timer(50);
      else clock.frame();
    }
    await flush();
    assert.equal(ready, true);
    await setup;
    clock.assertEmpty();
    lateFrame?.(); // A callback already dequeued by the browser must remain harmless.
    clock.assertEmpty();
    app.teardown(ctx);
    app.teardown(ctx);
    assert.equal(destroyed, 1);
  } finally {
    restore();
  }
}

(async () => {
  await testAppTeardown(false);
  await testAppTeardown(true);
  await testFailedFirstRenderCleansBeforeRetry("render-error");
  await testFailedFirstRenderCleansBeforeRetry("ready-rejection");
  await testPendingSetupDoesNotMountAfterDestroy();
  await testViewerTeardown(false);
  await testViewerTeardown(true);
  for (const mode of ["frames", "timeout", "cancel", "no-raf", "cancel-no-raf", "static-timeout"]) {
    await testDocsReady(mode);
  }
  console.log("Runtime lifecycle: 13 regression cases passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
