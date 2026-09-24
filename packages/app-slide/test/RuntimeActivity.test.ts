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
  const wm = { lazySetupInMaximizedMode: true, boxState: "maximized" };
  const calls: string[] = [];
  const warnings: unknown[] = [];
  const controller = new SlideControllerBase({
    context: {
      appId: "A",
      isAddApp: false,
      getRoom: () => ({
        logger: { info() {}, debug() {}, warn: (...args: unknown[]) => warnings.push(args) },
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
  return { wm, calls, warnings, controller };
}

async function run() {
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
    const { controller: c, calls, warnings } = fixture();
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
    assert.equal(warnings.length, 1);
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
  console.log("Slide runtime activity: 7 integration scenarios passed");
}
void run();
