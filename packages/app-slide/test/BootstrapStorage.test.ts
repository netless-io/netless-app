/* eslint-disable @typescript-eslint/no-var-requires -- Install browser globals before loading the controller. */
import assert from "node:assert/strict";

const noop = () => undefined;
(globalThis as any).window = { addEventListener: noop, removeEventListener: noop };
(globalThis as any).document = {
  visibilityState: "visible",
  addEventListener: noop,
  removeEventListener: noop,
};
const { SlideControllerBase, EmptyAttributes } = require("../src/SlideController");

const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const snapshot = (page: number) => ({ currentSlideIndex: page, mediaState: { marker: page } });

function fixture(initial: any = snapshot(2), isAddApp = false) {
  const restores: { state: any; done: ReturnType<typeof deferred> }[] = [];
  const received: any[] = [];
  const writes: any[] = [];
  const errors: unknown[] = [];
  const storageListeners = new Set<() => void>();
  let receive!: (event: any) => void;
  let writable = false;
  let activeRestores = 0;
  let maxActiveRestores = 0;
  const room = {
    uid: "reader",
    observerId: 22,
    logger: { info: noop, debug: noop, warn: noop, error: (...args: any[]) => errors.push(args) },
  };
  const storage = {
    state: { ...EmptyAttributes, taskId: "task", state: initial },
    ensureState: noop,
    setState: (state: any) => writes.push(state),
    addStateChangedListener: (listener: () => void) => {
      storageListeners.add(listener);
      return () => storageListeners.delete(listener);
    },
  };
  const context = {
    appId: "app",
    isAddApp,
    getRoom: () => room,
    getDisplayer: () => room,
    getIsWritable: () => writable,
    getAppOptions: () => ({ bgColor: "#fff" }),
    getWindowManager: () => ({ Logger: room.logger, emitter: { on: noop, off: noop } }),
    getBoxStatus: () => undefined,
    getInitScenePath: () => undefined,
    emitter: { off: noop },
    storage,
    addMagixEventListener: (_name: string, listener: (event: any) => void) => {
      receive = listener;
      return noop;
    },
    dispatchMagixEvent: (name: string, payload: any) => writes.push({ name, payload }),
  };
  class Controller extends SlideControllerBase {
    constructor() {
      super({
        context,
        onRenderStart: noop,
        onRenderEnd: noop,
        onPageChanged: noop,
        onTransitionStart: noop,
        onTransitionEnd: noop,
        onError: noop,
      });
      this.slide = this.createSlide({});
      this.slide.setResource = noop;
      this.slide.setResourceList = noop;
      this.slide.doRenderSlide = async () => undefined;
      this.slide.renderSlide = noop;
      this.slide.setSlideState = async (state: any) => {
        activeRestores++;
        maxActiveRestores = Math.max(maxActiveRestores, activeRestores);
        const done = deferred();
        restores.push({ state, done });
        try {
          await done.promise;
          this.slide.slideState = state;
        } finally {
          activeRestores--;
        }
      };
      this.slide.on("syncReceive", (event: any) => received.push(event));
      this.ready = true;
      this.registerEventListeners();
      this.kickStart();
    }
    protected pollReadyState = noop;
  }
  const c = new Controller();
  return {
    c,
    storage,
    restores,
    received,
    writes,
    errors,
    storageListeners,
    maxActiveRestores: () => maxActiveRestores,
    makeWritable: () => {
      writable = true;
    },
    update(state: any) {
      storage.state.state = state;
      for (const listener of storageListeners) listener();
    },
    signal(page: number) {
      receive({
        authorId: 11,
        payload: {
          type: "syncDispatch",
          payload: { type: "renderSlide", index: page, clientId: "writer", authorId: 99 },
        },
      });
    },
    unrelatedSignal() {
      receive({ payload: { type: "unrelated" } });
    },
  };
}

async function main() {
  {
    const f = fixture();
    assert.equal(f.storageListeners.size, 1);
    f.c.slide.emit("renderEnd", 2);
    f.restores[0].done.resolve();
    await tick();
    f.unrelatedSignal();
    f.update(snapshot(3));
    assert.deepEqual(
      f.restores.map(r => r.state.currentSlideIndex),
      [2, 3]
    );
    assert.equal(f.storageListeners.size, 1, "renderEnd/ready and a snapshot do not stop intake");
    f.restores[1].done.resolve();
    await tick();
    assert.equal(f.c.page, 3, "a missed startup signal is recovered by late storage");
    f.storage.state.slideScale = 2;
    f.update(snapshot(3));
    assert.equal(f.restores.length, 2, "equal snapshots and unrelated attributes are ignored");
    assert.deepEqual(f.writes, [], "snapshot recovery never writes shared state or signals");
    await f.c.destroy();
    assert.equal(f.storageListeners.size, 0);
  }
  {
    const f = fixture();
    f.update(snapshot(3));
    const latest = snapshot(4);
    f.update(latest);
    latest.mediaState.marker = 99;
    assert.equal(f.restores.length, 1, "pending snapshots wait for the initial restore");
    f.signal(5);
    assert.equal(f.storageListeners.size, 0, "first Slide signal immediately removes listener");
    f.update(snapshot(6));
    f.signal(7);
    assert.deepEqual(f.received, [], "live signals wait for accepted snapshot restores");
    f.restores[0].done.resolve();
    await tick();
    assert.deepEqual(
      f.restores.map(r => r.state.currentSlideIndex),
      [2, 4]
    );
    assert.equal(f.restores[1].state.mediaState.marker, 4, "pending snapshots are copied");
    assert.equal(f.maxActiveRestores(), 1, "setSlideState calls never overlap");
    f.restores[1].done.resolve();
    await tick();
    assert.deepEqual(
      f.received.map(e => e.index),
      [5, 7]
    );
    assert.equal(f.received[0].clientId, "writer");
    assert.equal(f.received[0].authorId, 11, "buffered signals retain transport authorship");
    f.update(snapshot(8));
    f.signal(9);
    assert.equal(f.restores.length, 2, "storage never overrides live signals after handoff");
    assert.deepEqual(
      f.received.map(e => e.index),
      [5, 7, 9]
    );
    await f.c.destroy();
  }
  {
    const f = fixture();
    f.signal(3);
    let reentered = false;
    f.c.slide.on("syncReceive", () => {
      if (!reentered) {
        reentered = true;
        f.signal(5);
      }
    });
    f.signal(4);
    f.restores[0].done.resolve();
    await tick();
    assert.deepEqual(
      f.received.map(e => e.index),
      [3, 4, 5],
      "reentrant delivery preserves FIFO"
    );
    await f.c.destroy();
  }
  {
    const f = fixture();
    f.restores[0].done.reject(new Error("restore failed"));
    await tick();
    assert.equal(f.errors.length, 1, "restore rejection is observed");
    f.update(snapshot(2));
    assert.equal(f.restores.length, 2, "a failed snapshot can be retried");
    f.signal(3);
    f.restores[1].done.reject(new Error("retry failed"));
    await tick();
    assert.deepEqual(
      f.received.map(e => e.index),
      [3],
      "restore failure cannot block live signals"
    );
    await f.c.destroy();
  }
  {
    const f = fixture();
    f.update(snapshot(3));
    f.signal(4);
    await f.c.destroy();
    f.restores[0].done.resolve();
    await tick();
    assert.equal(f.restores.length, 1, "destroy discards pending snapshots");
    assert.deepEqual(f.received, [], "destroy discards buffered signals");
    f.update(snapshot(5));
    assert.equal(f.storageListeners.size, 0);
  }
  {
    const f = fixture(null);
    assert.equal(f.restores.length, 0);
    f.signal(3);
    assert.deepEqual(
      f.received.map(e => e.index),
      [3],
      "no-snapshot setup receives signals directly"
    );
    f.update(snapshot(2));
    assert.equal(f.restores.length, 0);
    await f.c.destroy();
  }
  {
    const f = fixture(null, true);
    assert.equal(
      f.storageListeners.size,
      0,
      "App creator does not follow other clients' snapshots"
    );
    f.update(snapshot(2));
    assert.equal(f.restores.length, 0);
    f.makeWritable();
    f.signal(3);
    assert.deepEqual(
      f.received.map(e => e.index),
      [3]
    );
    await f.c.destroy();
  }
  console.log("Bootstrap: late storage, latest snapshot, FIFO handoff, errors and cleanup passed");
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
