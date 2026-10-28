/* eslint-disable @typescript-eslint/no-var-requires -- Browser globals precede controller import. */
import assert from "node:assert/strict";
const noop = () => undefined;
(globalThis as any).window = { addEventListener: noop, removeEventListener: noop };
(globalThis as any).document = {
  visibilityState: "visible",
  addEventListener: noop,
  removeEventListener: noop,
};
const { SlideControllerBase } = require("../src/SlideController");

class Controller extends SlideControllerBase {
  constructor(props: any) {
    super(props);
    this.slide = this.createSlide({});
    this.slide.slideState = { taskId: "deck", url: "base", currentSlideIndex: 1, mediaVolume: 0.5 };
    this.slide.applySharedMediaVolume = (volume: number) => {
      this.slide.slideState.mediaVolume = volume;
    };
    this.registerEventListeners();
    this.ready = true;
  }
  initialVolume() {
    this.applyInitialSharedMediaVolume(true);
  }
}

function fixture(shared: any, enabled: boolean | undefined, writable = true, id = 1) {
  const listeners = new Set<(diff: any) => void>();
  const writes: any[] = [],
    outgoing: any[] = [];
  let receive: (event: unknown) => void = noop;
  const room = {
    uid: "client-" + id,
    observerId: id,
    logger: { info: noop, debug: noop, warn: noop },
  };
  const manager = { emitter: { on: noop, off: noop } };
  const storage = {
    get state() {
      return shared;
    },
    ensureState: noop,
    setState(patch: any) {
      assert.ok(writable, "readonly must never write");
      writes.push(patch);
      Object.assign(shared, patch);
      notify(Object.fromEntries(Object.keys(patch).map(k => [k, { newValue: shared[k] }])));
    },
    addStateChangedListener(fn: (diff: any) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  function notify(diff: any) {
    for (const fn of [...listeners]) fn(diff);
  }
  const context = {
    appId: "app-" + id,
    isAddApp: true,
    getRoom: () => room,
    getDisplayer: () => room,
    getIsWritable: () => writable,
    getAppOptions: () => ({ bgColor: "#fff", enableSharedMediaVolume: enabled }),
    getWindowManager: () => manager,
    getBoxStatus: () => undefined,
    getInitScenePath: () => "/deck",
    setScenePath: async () => undefined,
    dispatchMagixEvent: (...args: any[]) => outgoing.push(args),
    addMagixEventListener: (_name: string, fn: typeof receive) => {
      receive = fn;
      return noop;
    },
    storage,
    emitter: { on: noop, off: noop },
  };
  const c = new Controller({
    context,
    onRenderStart: noop,
    onRenderEnd: noop,
    onPageChanged: noop,
    onTransitionStart: noop,
    onTransitionEnd: noop,
    onError: noop,
  });
  return {
    c,
    shared,
    writes,
    outgoing,
    notify,
    request(value: number, taskId = "deck") {
      c.slide.emit("syncDispatch", {
        type: "mediaVolumeChange",
        volume: value,
        taskId,
        url: "base",
        slideIndex: 1,
      });
    },
    legacy(value: number) {
      receive({
        authorId: id,
        payload: {
          type: "syncDispatch",
          payload: {
            type: "mediaVolumeChange",
            volume: value,
            taskId: "deck",
            url: "base",
            slideIndex: 1,
          },
        },
      });
    },
    enterLive() {
      receive({
        authorId: id,
        payload: {
          type: "syncDispatch",
          payload: { type: "renderSlide", index: 1, slideIndex: 1 },
        },
      });
    },
    writable(value: boolean) {
      writable = value;
    },
  };
}
async function main() {
  for (const flag of [undefined, false]) {
    const f = fixture({ state: { taskId: "deck", url: "base", mediaVolume: 0.63 } }, flag);
    assert.equal(f.c.slide.config.enableSharedMediaVolume, false);
    f.c.initialVolume();
    f.request(0.9);
    f.legacy(0.8);
    assert.equal(f.c.slide.slideState.mediaVolume, 0.5);
    assert.equal(f.writes.length, 0);
    assert.equal(f.outgoing.length, 0);
    assert.ok(!("sharedMediaVolume" in f.shared));
    await f.c.destroy();
  }
  const shared: any = { state: { taskId: "deck", url: "base", mediaVolume: 0.63 } };
  const a = fixture(shared, true),
    r = fixture(shared, true, false, 2);
  a.c.initialVolume();
  r.c.initialVolume();
  assert.equal(
    a.c.slide.slideState.mediaVolume,
    0.63,
    "legacy room volume remains readable when enabled"
  );
  assert.equal(a.writes.length, 0, "opening legacy room does not migrate/write volume");
  a.request(0.78);
  r.notify({ sharedMediaVolume: {} });
  const olderId = shared.sharedMediaVolume.changeId;
  a.request(0.21);
  r.notify({ sharedMediaVolume: {} });
  assert.equal(r.c.slide.slideState.mediaVolume, 0.21);
  assert.notEqual(shared.sharedMediaVolume.changeId, olderId);
  assert.equal(a.outgoing.length, 0, "volume never goes through Magix");
  assert.equal(a.writes.length, 2, "authority application does not echo snapshots");
  // The old full snapshot may still arrive, but it cannot overwrite the authority.
  shared.state = { taskId: "deck", url: "base", mediaVolume: 0.78 };
  r.notify({ state: {} });
  assert.equal(r.c.slide.slideState.mediaVolume, 0.21);
  assert.equal(r.c.slide.config.getSharedMediaVolume("deck", "base"), 0.21);
  assert.equal(r.c.slide.config.getSharedMediaVolume("other", "base"), undefined);
  const late = fixture(shared, true, false, 3);
  late.c.initialVolume();
  assert.equal(
    late.c.slide.slideState.mediaVolume,
    0.21,
    "late join uses authority over stale snapshot"
  );
  r.enterLive();
  a.request(0.31);
  r.notify({ sharedMediaVolume: {} });
  assert.equal(
    r.c.slide.slideState.mediaVolume,
    0.31,
    "volume listener survives bootstrap teardown"
  );
  r.c.storageBlocked = true;
  a.request(0.41);
  r.notify({ sharedMediaVolume: {} });
  assert.equal(
    r.c.slide.slideState.mediaVolume,
    0.41,
    "frozen Slide tracks authority without a Player"
  );
  r.c.slide.slideState.mediaVolume = 0.07;
  r.notify({ sharedMediaVolume: {} });
  assert.equal(
    r.c.slide.slideState.mediaVolume,
    0.07,
    "duplicate authority notification preserves a later local override"
  );
  const id = shared.sharedMediaVolume.changeId;
  a.request(0.41);
  r.notify({ sharedMediaVolume: {} });
  assert.notEqual(shared.sharedMediaVolume.changeId, id);
  assert.equal(
    r.c.slide.slideState.mediaVolume,
    0.41,
    "same-value command still overrides local volume"
  );
  const count = a.writes.length;
  a.request(NaN);
  a.request(-1);
  a.request(2);
  a.request(0.9, "other");
  a.legacy(0.99);
  r.request(0.9);
  assert.equal(a.writes.length, count);
  assert.equal(r.writes.length, 0);
  a.writable(false);
  a.request(0.9);
  assert.equal(a.writes.length, count);
  a.writable(true);
  a.request(0);
  r.notify({ sharedMediaVolume: {} });
  assert.equal(r.c.slide.slideState.mediaVolume, 0, "zero is a valid authoritative value");
  const isolated = fixture({ state: null }, true, false, 4);
  isolated.c.initialVolume();
  assert.equal(isolated.c.slide.slideState.mediaVolume, 0.5);
  await r.c.destroy();
  const last = r.c.slide.slideState.mediaVolume;
  a.request(0.66);
  r.notify({ sharedMediaVolume: {} });
  assert.equal(r.c.slide.slideState.mediaVolume, last);
  await Promise.all([a.c.destroy(), late.c.destroy(), isolated.c.destroy()]);
  console.log(
    "Shared volume: default/disabled, authority, stale snapshots, late join, same-value, readonly, lifecycle and isolation passed"
  );
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
