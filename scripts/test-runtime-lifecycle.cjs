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
      "./SlideController": {},
      "./SlidePreviewer": {},
      "./DocsViewer": {},
      "./utils/freezer": { useFreezer: false },
      "./utils/logger": { log() {}, logger: { setAppContext() {}, deleteApp() {} } },
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
    const setup = app.setup(ctx);
    const destroyListener = ctx.listeners.get("destroy");
    let firstDone = false,
      secondDone = false,
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
    const first = observe(app.teardown(ctx), () => {
      firstDone = true;
    });
    const event = observe(destroyListener(), () => {
      eventDone = true;
    });
    await flush();
    const second = observe(app.teardown(ctx), () => {
      secondDone = true;
    });
    await flush();
    assert.equal(calls, 1);
    assert.equal(firstDone || secondDone || eventDone, false);
    if (rejectDestroy) pending.reject(expected);
    else pending.resolve();
    await flush();
    assert.equal(firstDone && secondDone && eventDone, true);
    await Promise.all([first, second, event]);
    clock.timer(100); // Existing setup poll observes disposal and cleans its timers.
    await setup;
    assert.equal(ctx.listeners.has("destroy"), false);
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
  await testViewerTeardown(false);
  await testViewerTeardown(true);
  for (const mode of ["frames", "timeout", "cancel", "no-raf", "cancel-no-raf", "static-timeout"]) {
    await testDocsReady(mode);
  }
  console.log("Runtime lifecycle: 10 regression cases passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
