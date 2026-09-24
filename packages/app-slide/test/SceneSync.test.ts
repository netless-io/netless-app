import assert from "node:assert/strict";
import {
  SceneSync,
  isOwnWritableEvent,
  withTransportAuthor,
} from "../src/SlideController/SceneSync";

const a = { clientId: "shared-uid", authorId: 11 };
const b = { clientId: "shared-uid", authorId: 22 };
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function harness(
  options: { author?: number; writable?: boolean; creator?: boolean; plugin?: any } = {}
) {
  const scenes = new Set(["/deck/1", "/deck/2", "/deck/3"]);
  const writes: string[] = [],
    puts: string[][] = [],
    errors: unknown[] = [];
  const room = {
    uid: "shared-uid",
    observerId: options.author ?? 11,
    scenePathType: (path: string) => (scenes.has(path) ? "page" : "none"),
    putScenes(base: string, values: { name: string }[]) {
      puts.push(values.map(v => v.name));
      values.forEach(v => scenes.add(`${base}/${v.name}`));
    },
  };
  const context: any = {
    appId: "app-a",
    isAddApp: options.creator ?? false,
    getRoom: () => room,
    getDisplayer: () => room,
    getIsWritable: () => options.writable ?? true,
    getInitScenePath: () => "/deck",
    getWindowManager: () => ({ _appliancePlugin: options.plugin }),
    async setScenePath(path: string) {
      writes.push(path);
    },
  };
  const slide: any = { slideCount: 3, slideState: { currentSlideIndex: 1 } };
  const sync = new SceneSync(
    context,
    () => slide,
    error => errors.push(error)
  );
  return { sync, context, scenes, writes, puts, errors };
}

async function main() {
  const sender = harness(),
    slow = harness({ author: 22 }),
    reader = harness({ writable: false });
  sender.sync.renderEnd(3, a);
  await tick();
  slow.sync.renderEnd(2, a);
  reader.sync.renderEnd(3, a);
  await tick();
  assert.deepEqual(sender.writes, ["/deck/3"], "use callback index, not stale slideState");
  assert.deepEqual(slow.writes, []);
  assert.deepEqual(reader.writes, []);
  sender.sync.renderEnd(1);
  sender.sync.renderEnd(2, b);
  await tick();
  assert.deepEqual(sender.writes, ["/deck/3"]);
  assert.equal(isOwnWritableEvent(slow.context, a), false, "shared uid is not ownership");
  const payload: any = { type: "renderSlide", clientId: "customer", authorId: 999 };
  assert.deepEqual(withTransportAuthor(payload, 11), { ...payload, authorId: 11 });
  assert.equal(payload.authorId, 999);

  const creator = harness({ creator: true });
  creator.scenes.clear();
  creator.sync.renderEnd(1);
  await tick();
  creator.sync.renderEnd(2, a);
  await tick();
  creator.scenes.delete("/deck/3");
  creator.sync.renderEnd(3, a);
  await tick();
  assert.deepEqual(creator.puts, [["1", "2", "3"]]);
  const restored = harness({ creator: true });
  restored.sync.renderEnd(1);
  await tick();
  assert.deepEqual(restored.writes, []);

  for (const writable of [true, false]) {
    const calls: string[][] = [];
    const h = harness({
      writable,
      plugin: {
        currentManager: { viewContainerManager: { getView: () => ({}) } },
        async setViewLocalScenePathChange(...args: string[]) {
          calls.push(args);
        },
      },
    });
    h.sync.renderEnd(3, b);
    await tick();
    h.sync.renderEnd(2);
    await tick();
    assert.deepEqual(calls, [
      ["/deck/3", "app-a"],
      ["/deck/2", "app-a"],
    ]);
    assert.deepEqual(h.writes, []);
    h.sync.destroy();
  }
  const calls: string[] = [];
  let release!: () => void;
  const serial = harness({
    plugin: {
      currentManager: { viewContainerManager: { getView: () => ({}) } },
      async setViewLocalScenePathChange(path: string) {
        calls.push(path);
        if (path === "/deck/1")
          await new Promise<void>(r => {
            release = r;
          });
      },
    },
  });
  serial.sync.renderEnd(1);
  serial.sync.renderEnd(2);
  serial.sync.renderEnd(3);
  release();
  await tick();
  assert.deepEqual(calls, ["/deck/1", "/deck/3"]);

  let rejectFirst!: (error: Error) => void;
  const afterFailure: string[] = [];
  const failing = harness({
    plugin: {
      currentManager: { viewContainerManager: { getView: () => ({}) } },
      async setViewLocalScenePathChange(path: string) {
        afterFailure.push(path);
        if (path === "/deck/1")
          await new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          });
      },
    },
  });
  failing.sync.renderEnd(1);
  failing.sync.renderEnd(3);
  rejectFirst(new Error("old switch failed"));
  await tick();
  assert.deepEqual(afterFailure, ["/deck/1", "/deck/3"]);
  assert.equal(failing.errors.length, 1, "failed old switch must not discard new completed page");
  failing.sync.destroy();

  const timers = new Map<number, () => void>();
  const oldSet = global.setTimeout,
    oldClear = global.clearTimeout;
  let id = 0;
  global.setTimeout = ((fn: () => void) => {
    timers.set(++id, fn);
    return id;
  }) as any;
  global.clearTimeout = ((key: number) => {
    timers.delete(key);
  }) as any;
  try {
    let mounted = false;
    const local: string[] = [];
    const late = harness({
      writable: false,
      plugin: {
        currentManager: { viewContainerManager: { getView: () => (mounted ? {} : undefined) } },
        async setViewLocalScenePathChange(path: string) {
          local.push(path);
        },
      },
    });
    late.sync.renderEnd(1);
    late.sync.renderEnd(3);
    assert.equal(timers.size, 1);
    mounted = true;
    const fn = [...timers.values()][0];
    timers.clear();
    fn();
    await tick();
    assert.deepEqual(local, ["/deck/3"]);
    mounted = false;
    late.sync.renderEnd(2);
    late.sync.destroy();
    assert.equal(timers.size, 0);
    const unsupported = harness({ plugin: {} });
    unsupported.sync.renderEnd(3, a);
    await tick();
    assert.equal(unsupported.errors.length, 1);
    assert.deepEqual(unsupported.writes, []);
  } finally {
    global.setTimeout = oldSet;
    global.clearTimeout = oldClear;
  }
  [sender, slow, reader, creator, restored, serial].forEach(h => h.sync.destroy());
  console.log("SceneSync ownership, initialization, local switching and lifecycle passed");
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
