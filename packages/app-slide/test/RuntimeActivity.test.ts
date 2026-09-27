import { strict as assert } from "node:assert";

(globalThis as any).window = { addEventListener() {}, removeEventListener() {} };
(globalThis as any).document = { visibilityState: "visible" };
// Initialize the real controller after its browser globals are available.
const { SlideControllerBase, enqueueSlideWebGLTransition } = require("../src/SlideController");
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

function fixture() {
  (document as any).visibilityState = "visible";
  const errors: unknown[] = [];
  const wm = {
    lazySetupInMaximizedMode: true,
    boxState: "maximized",
    Logger: {
      info() {}, debug() {}, warn() {},
      error: (...args: unknown[]) => errors.push(args),
    },
  };
  const calls: string[] = [];
  const controller = new SlideControllerBase({
    context: {
      appId: "A",
      isAddApp: false,
      getRoom: () => ({
        logger: {
          info() {}, debug() {}, warn() {},
          error() {},
        },
      }),
      getWindowManager: () => wm,
      getBoxStatus: () => undefined,
      storage: { state: { state: { slide: 2 } } },
    },
  });
  controller.ready = true;
  controller.slide = {
    frozen: async () => {
      calls.push("freeze");
    },
    release: async (resize: () => void) => {
      calls.push("release");
      resize();
    },
    notifyFrameResize: () => calls.push("resize"),
    setSlideState: async () => {
      calls.push("state");
    },
  };
  return { wm, calls, errors, controller };
}

async function run() {
  {
    const { controller: c } = fixture();
    const actions: string[] = [];
    const context = c.context as any;
    context.getIsWritable = () => false;
    context.storage.state = {
      taskId: "persisted-task",
      url: "https://example.com/dynamicConvert",
      state: null,
      resourceList: [],
    };
    c.slide.setResource = () => actions.push("resource");
    c.slide.renderSlide = () => actions.push("sync-render");
    c.slide.doRenderSlide = async (page: number) => { actions.push(`local-render:${page}`); };
    (c as any).pollReadyState = () => undefined;

    (c as any).kickStart();
    await flush();
    assert.deepEqual(actions, ["resource", "local-render:1"],
      "a restored read-only App with no slide state renders its first page locally");
  }
  {
    const { controller: c, wm, calls } = fixture();
    await c.setFocusedState(false);
    (document as any).visibilityState = "hidden";
    await c.setFocusedState(true);
    assert.deepEqual(calls, ["freeze"], "background focus never releases");
    wm.boxState = "minimized";
    (document as any).visibilityState = "visible";
    await c.onVisibilityChange();
    assert.deepEqual(calls, ["freeze"], "foreground alone cannot release a minimized slide");
    wm.boxState = "maximized";
    await c.reconcileActivity();
    assert.deepEqual(calls, ["freeze", "release", "resize", "state"]);
    await c.setFocusedState(true);
    assert.equal(calls.length, 4, "duplicate active notifications share completion");
  }
  {
    const { controller: c, calls } = fixture();
    const release = deferred();
    await c.setFocusedState(false);
    c.slide.release = async (resize: () => void) => {
      calls.push("release:start");
      await release.promise;
      resize();
      calls.push("release:end");
    };
    const focusing = c.setFocusedState(true);
    await flush();
    (document as any).visibilityState = "hidden";
    const hiding = c.onVisibilityChange();
    await flush();
    assert.deepEqual(calls, ["freeze", "release:start"], "freeze waits for release");
    release.resolve();
    await Promise.all([focusing, hiding]);
    assert.deepEqual(
      calls,
      ["freeze", "release:start", "release:end", "freeze"],
      "stale release must not restore a slide state or resize while hidden"
    );
    assert.equal(c.isFrozen, true);
  }
  {
    const { controller: c, calls, errors } = fixture();
    c.slide.frozen = async () => {
      calls.push("freeze:failed");
      throw new Error("freeze failed");
    };
    await assert.rejects(c.setFocusedState(false), /freeze failed/);
    await c.setFocusedState(true);
    assert.deepEqual(
      calls,
      ["freeze:failed", "release", "resize", "state"],
      "unknown resource state must reconcile even when the old boolean was active"
    );
    assert.equal(errors.length, 1);
  }
  {
    const { controller: c, wm, errors } = fixture();
    wm.lazySetupInMaximizedMode = false;
    c.slide.frozen = async () => {
      throw new Error("legacy freeze failed");
    };
    c.onAppStateChangeHandler("minimized");
    await flush();
    assert.equal(errors.length, 1, "legacy status errors are observed");
    (document as any).visibilityState = "hidden";
    await c.onVisibilityChange();
    assert.equal(errors.length, 2, "DOM visibility listener does not reject");
    (document as any).visibilityState = "visible";
  }
  {
    const { controller: c, calls, wm } = fixture();
    await c.setFocusedState(false);
    wm.lazySetupInMaximizedMode = false;
    await c.reconcileActivity();
    assert.equal(c.isFrozen, false, "disabling lazy resumes a retained unfocused runtime");
    (document as any).visibilityState = "hidden";
    await c.onVisibilityChange();
    (document as any).visibilityState = "visible";
    await c.onVisibilityChange();
    assert.deepEqual(calls, [
      "freeze",
      "release",
      "resize",
      "state",
      "freeze",
      "release",
      "resize",
      "state",
    ]);
  }
  {
    const { controller: c, wm, calls } = fixture();
    let active = false;
    c.context.getRuntimeActivity = () => ({ active, revision: 1 });
    await c.setFocusedState(true);
    wm.boxState = "minimized";
    active = true;
    const release = deferred();
    c.slide.release = async () => { calls.push("release"); await release.promise; };
    let done = false;
    const activation = c.reconcileActivity().then(() => { done = true; });
    await flush();
    assert.equal(done, false, "restored host activity waits for the real engine release");
    release.resolve(); await activation;
    assert.equal(c.isFrozen, false, "host snapshot wins over a stale UI boxState");
    active = false; wm.boxState = "maximized";
    await c.reconcileActivity();
    assert.equal(c.isFrozen, true, "host suspension wins over a stale visible UI");
  }
  {
    const old = fixture();
    const next = fixture();
    const destroyed = deferred();
    const events: string[] = [];
    old.controller.slide.frozen = (onPlayerDestroyed: () => void) => {
      events.push("destroy:start");
      void destroyed.promise.then(() => {
        events.push("destroy:done");
        onPlayerDestroyed();
      });
    };
    next.controller.isFrozen = true;
    let finishRestore!: () => void;
    next.controller.slide.release = (
      onRestored: () => void,
      onPlayerCreated: () => void
    ) => {
      events.push("create");
      finishRestore = onRestored;
      onPlayerCreated();
    };
    const blurring = old.controller.setFocusedState(false);
    const focusing = next.controller.setFocusedState(true);
    await flush();
    assert.deepEqual(events, ["destroy:start"], "new player waits for old player destruction");
    destroyed.resolve();
    await Promise.all([blurring, focusing]);
    assert.deepEqual(events, ["destroy:start", "destroy:done", "create"]);
    assert.deepEqual(next.calls, [], "storage restoration does not block focus completion");
    finishRestore();
    await flush();
    assert.deepEqual(next.calls, ["resize", "state"]);
  }
  {
    const old = fixture();
    const next = fixture();
    const events: string[] = [];
    const destroyComplete = deferred();
    old.controller.slide.frozen = () => { events.push("freeze:pending"); };
    old.controller.slide.destroy = (onPlayerDestroyed: () => void) => {
      events.push("destroy:start");
      void destroyComplete.promise.then(() => {
        events.push("player:destroyed");
        onPlayerDestroyed();
      });
    };
    next.controller.isFrozen = true;
    next.controller.slide.release = (_restored: () => void, onPlayerCreated: () => void) => {
      events.push("player:created");
      onPlayerCreated();
    };
    const blurring = old.controller.setFocusedState(false);
    const focusing = next.controller.setFocusedState(true);
    await flush();
    const setup = enqueueSlideWebGLTransition(() => { events.push("setup:create"); });
    assert.deepEqual(events, ["freeze:pending"]);
    const closing = old.controller.destroy();
    await flush();
    assert.deepEqual(events, ["freeze:pending", "destroy:start"]);
    destroyComplete.resolve();
    await Promise.all([closing, blurring, focusing, setup]);
    assert.deepEqual(events, [
      "freeze:pending", "destroy:start", "player:destroyed", "player:created", "setup:create",
    ]);
  }
  {
    const roomWarnings: unknown[][] = [];
    const roomErrors: unknown[][] = [];
    const managerInfo: unknown[][] = [];
    const managerDebug: unknown[][] = [];
    const managerWarnings: unknown[][] = [];
    const managerErrors: unknown[][] = [];
    const customWarnings: unknown[][] = [];
    const customErrors: unknown[][] = [];
    const customLogger = {
      warn: (...args: unknown[]) => customWarnings.push(args),
      error: (...args: unknown[]) => customErrors.push(args),
    };
    const room = {
      logger: {
        info() {},
        debug() {},
        warn: (...args: unknown[]) => roomWarnings.push(args),
        error: (...args: unknown[]) => roomErrors.push(args),
      },
    };
    const controller = new SlideControllerBase({
      context: {
        appId: "warning-test",
        isAddApp: false,
        getRoom: () => room,
        getWindowManager: () => ({ Logger: {
          info: (...args: unknown[]) => managerInfo.push(args),
          debug: (...args: unknown[]) => managerDebug.push(args),
          warn: (...args: unknown[]) => managerWarnings.push(args),
          error: (...args: unknown[]) => managerErrors.push(args),
        } }),
        getAppOptions: () => ({
          bgColor: "#fff",
          logger: customLogger,
        }),
        storage: { state: { customLinks: [] } },
      },
    });
    const slide = (controller as any).createSlide({});
    const error = new Error("WebGL cleanup failed");
    const { log, verbose } = require("../src/utils/logger");
    log("[Slide] info via manager");
    verbose("[Slide] debug via manager");
    slide.config.logger.warn("[task] release failed", error);
    slide.config.logger.error("[task] restore failed", error);
    assert.deepEqual(managerInfo, [["[Slide] info via manager"]]);
    assert.deepEqual(managerDebug, [["[Slide] debug via manager"]]);
    assert.deepEqual(managerWarnings, [["[task] release failed", error]]);
    assert.deepEqual(customWarnings, [["[task] release failed", error]]);
    assert.deepEqual(managerErrors, [["[task] restore failed", error]]);
    assert.deepEqual(customErrors, [["[task] restore failed", error]]);
    assert.deepEqual(roomWarnings, []);
    assert.deepEqual(roomErrors, []);

    customLogger.warn = () => { throw new Error("custom warning logger failed"); };
    customLogger.error = () => { throw new Error("custom error logger failed"); };
    assert.doesNotThrow(() => slide.config.logger.warn("[task] later warning", error));
    assert.doesNotThrow(() => slide.config.logger.error("[task] later error", error));
    assert.deepEqual(managerWarnings.at(-1), ["[task] later warning", error]);
    assert.deepEqual(managerErrors.at(-1), ["[task] later error", error]);
  }
  {
    const { logger, setRoomLogger } = require("../src/utils/logger");
    const calls: unknown[][] = [];
    const replayContext = {
      getWindowManager: () => ({ Logger: {
        info() {},
        debug() {},
        warn: (...args: unknown[]) => calls.push(["warn", ...args]),
        error: (...args: unknown[]) => calls.push(["error", ...args]),
      } }),
      getRoom: () => undefined,
    };
    setRoomLogger(replayContext);
    logger.warn("[Slide] first render still pending", "A", 5000);
    logger.error("[Slide] resource transition failed", "A");
    assert.deepEqual(calls, [
      ["warn", "[Slide] first render still pending", "A", 5000],
      ["error", "[Slide] resource transition failed", "A"],
    ]);
  }
  {
    const { apps, getFreezerLength, setFreezerLength } = require("../src/utils/freezer");
    const { logger } = require("../src/utils/logger");
    const previousLogger = logger.roomLogger;
    const previousLength = getFreezerLength();
    const entries: unknown[][] = [];
    const frozen: string[] = [];
    const boxA = { zIndex: 1 };
    const boxB = { zIndex: 2 };
    try {
      logger.roomLogger = {
        info: (...args: unknown[]) => entries.push(args),
        debug() {},
        warn: (...args: unknown[]) => entries.push(args),
      };
      setFreezerLength(1);
      apps.set("A", { freeze: () => frozen.push("A"), unfreeze() {} }, boxA);
      apps.set("B", { freeze: () => frozen.push("B"), unfreeze() {} }, boxB);
      boxA.zIndex = 3;
      apps.focus("A");
      apps.focus("missing");

      assert.deepEqual(frozen, ["A", "B"]);
      assert.deepEqual(entries.filter(entry => entry[0] === "[Slide] freezer: add"), [
        ["[Slide] freezer: add", "A", "[A]", "validate", "[A]"],
        ["[Slide] freezer: add", "B", "[B]", "validate", "[B,A]", "freeze-requested", "[A]"],
      ]);
      assert.deepEqual(entries.filter(entry => entry[0] === "[Slide] freezer: focus"), [
        ["[Slide] freezer: focus", "A", "[A]", "validate", "[A,B]", "freeze-requested", "[B]"],
      ]);
      assert.deepEqual(entries.filter(entry => entry[0] === "[Slide] freezer: focus-missing"), [
        ["[Slide] freezer: focus-missing", "missing", "[A]", "validate", "[A,missing]", "missing", "[missing]"],
      ]);
      assert.equal(entries.some(entry => entry[0] === "[Slide] freezer: validate"), false);
    } finally {
      apps.map.clear();
      apps.boxes.clear();
      apps.queue.length = 0;
      apps.focusedAppId = undefined;
      setFreezerLength(previousLength);
      logger.roomLogger = previousLogger;
    }
  }
  {
    const { apps, getFreezerLength, setFreezerLength } = require("../src/utils/freezer");
    const { logger } = require("../src/utils/logger");
    const previousLogger = logger.roomLogger;
    const previousLength = getFreezerLength();
    const previousSetTimeout = globalThis.setTimeout;
    const timers: Array<() => void> = [];
    const warnings: unknown[][] = [];
    let freezes = 0;
    let releases = 0;
    try {
      (globalThis as any).setTimeout = (callback: () => void, delay: number) => {
        assert.equal(delay, 500);
        timers.push(callback);
        return timers.length;
      };
      logger.roomLogger = {
        info: () => undefined,
        debug: () => undefined,
        error: () => undefined,
        warn: (...args: unknown[]) => warnings.push(args),
      };
      setFreezerLength(1);
      const boxA = { zIndex: 1 };
      const boxB = { zIndex: 2 };
      apps.set("A", {
        freeze: async () => {
          if (++freezes === 1) throw new Error("freeze failed");
        },
        unfreeze: async () => {
          if (++releases === 1) throw new Error("release failed");
        },
      }, boxA);
      apps.set("B", { freeze: () => undefined, unfreeze: () => undefined }, boxB);
      await flush();
      assert.deepEqual(apps.queue, ["B", "A"], "failed freeze remains eligible for retry");
      assert.equal(timers.length, 1);
      const retryFreeze = timers.shift();
      assert.ok(retryFreeze);
      retryFreeze();
      await flush();
      assert.equal(freezes, 2);
      assert.deepEqual(apps.queue, ["B"]);

      boxA.zIndex = 3;
      apps.focus("A");
      await flush();
      assert.equal(timers.length, 1);
      const retryRelease = timers.shift();
      assert.ok(retryRelease);
      retryRelease();
      await flush();
      assert.equal(releases, 2, "focused app retries a failed release once");
      assert.deepEqual(warnings.map(args => args[0]), [
        "[Slide] freezer: freeze failed",
        "[Slide] freezer: unfreeze failed",
      ]);
    } finally {
      (globalThis as any).setTimeout = previousSetTimeout;
      apps.map.clear();
      apps.boxes.clear();
      apps.queue.length = 0;
      apps.focusedAppId = undefined;
      setFreezerLength(previousLength);
      logger.roomLogger = previousLogger;
    }
  }
  {
    const { apps, getFreezerLength, setFreezerLength } = require("../src/utils/freezer");
    const previousLength = getFreezerLength();
    const previousSetTimeout = globalThis.setTimeout;
    const timers: Array<() => void> = [];
    let freezes = 0;
    try {
      (globalThis as any).setTimeout = (callback: () => void) => {
        timers.push(callback);
        return timers.length;
      };
      setFreezerLength(1);
      apps.set("A", {
        freeze: () => {
          freezes++;
          if (freezes === 1) throw new Error("synchronous freeze failure");
        },
        unfreeze: () => undefined,
      }, { zIndex: 1 });
      apps.set("B", { freeze: () => undefined, unfreeze: () => undefined }, { zIndex: 2 });
      await flush();
      assert.deepEqual(apps.queue, ["B", "A"]);
      const retry = timers.shift();
      assert.ok(retry);
      retry();
      await flush();
      assert.equal(freezes, 2);
      assert.deepEqual(apps.queue, ["B"]);
    } finally {
      (globalThis as any).setTimeout = previousSetTimeout;
      apps.map.clear();
      apps.boxes.clear();
      apps.queue.length = 0;
      apps.focusedAppId = undefined;
      setFreezerLength(previousLength);
    }
  }
  console.log("Slide runtime activity: 12 integration scenarios passed");
}
void run();
