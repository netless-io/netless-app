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
  options: {
    author?: number;
    writable?: boolean;
    creator?: boolean;
    plugin?: any;
    failOnce?: "remove" | "put";
    switchScene?: (path: string) => Promise<void>;
  } = {}
) {
  const scenes = new Set(["/deck/1", "/deck/2", "/deck/3"]);
  const writes: string[] = [],
    puts: string[][] = [],
    errors: unknown[] = [];
  const attempts = { remove: 0, put: 0 };
  let failure = options.failOnce;
  const checkFailure = (operation: "remove" | "put") => {
    attempts[operation]++;
    if (failure === operation) {
      failure = undefined;
      throw new Error(`Injected ${operation}Scenes failure`);
    }
  };
  const room = {
    uid: "shared-uid",
    observerId: options.author ?? 11,
    scenePathType: (path: string) => (scenes.has(path) ? "page" : "none"),
    removeScenes(base: string) {
      checkFailure("remove");
      [...scenes].filter(path => path.startsWith(`${base}/`)).forEach(path => scenes.delete(path));
    },
    putScenes(base: string, values: { name: string }[]) {
      checkFailure("put");
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
      await options.switchScene?.(path);
    },
  };
  const slide: any = { slideCount: 3, slideState: { currentSlideIndex: 1 } };
  const sync = new SceneSync(
    context,
    () => slide,
    error => errors.push(error)
  );
  return { sync, context, scenes, writes, puts, errors, attempts };
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
  creator.scenes.add("/deck/window-manager-placeholder");
  creator.sync.renderEnd(1);
  await tick();
  assert.deepEqual([...creator.scenes], ["/deck/1", "/deck/2", "/deck/3"]);
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
  restored.scenes.delete("/deck/3");
  restored.sync.renderEnd(3);
  await tick();
  assert.deepEqual(restored.puts, [], "existing complete scenes mark initialization finished");
  assert.deepEqual(restored.writes, []);
  const partial = harness({ creator: true });
  partial.scenes.delete("/deck/2");
  partial.scenes.delete("/deck/3");
  partial.scenes.add("/deck/existing-notes");
  partial.sync.renderEnd(1);
  await tick();
  assert.deepEqual(partial.puts, [["2", "3"]]);
  assert.equal(partial.scenes.has("/deck/1"), true);
  assert.equal(partial.scenes.has("/deck/existing-notes"), true);
  const follower = harness();
  follower.scenes.clear();
  follower.sync.renderEnd(1, a);
  await tick();
  assert.deepEqual(follower.puts, [], "only the App creator initializes pages");

  for (const failOnce of ["remove", "put"] as const) {
    for (const withPlugin of [false, true]) {
      const local: string[][] = [];
      const recovering = harness({
        creator: true,
        failOnce,
        plugin: withPlugin
          ? {
              currentManager: { viewContainerManager: { getView: () => ({}) } },
              async setViewLocalScenePathChange(...args: string[]) {
                local.push(args);
              },
            }
          : undefined,
      });
      recovering.scenes.clear();
      recovering.scenes.add("/deck/window-manager-placeholder");
      recovering.sync.renderEnd(1);
      await tick();
      assert.equal(recovering.errors.length, 1);
      assert.equal(recovering.scenes.has("/deck/1"), false);
      assert.deepEqual(recovering.writes, []);
      assert.deepEqual(local, []);

      recovering.sync.renderEnd(2);
      await tick();
      assert.deepEqual([...recovering.scenes], ["/deck/1", "/deck/2", "/deck/3"]);
      assert.deepEqual(
        recovering.writes,
        ["/deck/2"],
        "retry initializes the latest rendered page"
      );
      assert.deepEqual(local, [], "scene initialization never calls the local plugin API");
      assert.deepEqual(recovering.attempts, { remove: 2, put: failOnce === "put" ? 2 : 1 });
      const completedAttempts = { ...recovering.attempts };
      recovering.sync.renderEnd(3);
      await tick();
      assert.deepEqual(recovering.attempts, completedAttempts, "success initializes only once");
      assert.equal(recovering.errors.length, 1);
      recovering.sync.destroy();
    }
  }

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
    h.sync.renderEnd(3, a);
    await tick();
    h.sync.renderEnd(2, b);
    await tick();
    h.sync.renderEnd(1);
    await tick();
    assert.deepEqual(calls, []);
    assert.deepEqual(h.writes, writable ? ["/deck/3"] : []);
    h.sync.destroy();
  }
  const calls: string[] = [];
  let release!: () => void;
  const serial = harness({
    async switchScene(path: string) {
      calls.push(path);
      if (path === "/deck/1")
        await new Promise<void>(r => {
          release = r;
        });
    },
  });
  serial.sync.renderEnd(1, a);
  serial.sync.renderEnd(2, a);
  serial.sync.renderEnd(3, a);
  release();
  await tick();
  assert.deepEqual(calls, ["/deck/1", "/deck/3"]);

  let rejectFirst!: (error: Error) => void;
  const afterFailure: string[] = [];
  const failing = harness({
    async switchScene(path: string) {
      afterFailure.push(path);
      if (path === "/deck/1")
        await new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        });
    },
  });
  failing.sync.renderEnd(1, a);
  failing.sync.renderEnd(3, a);
  rejectFirst(new Error("old switch failed"));
  await tick();
  assert.deepEqual(afterFailure, ["/deck/1", "/deck/3"]);
  assert.equal(failing.errors.length, 1, "failed old switch must not discard new completed page");
  failing.sync.destroy();

  const unavailablePlugin = harness({ plugin: {} });
  unavailablePlugin.sync.renderEnd(3, a);
  await tick();
  assert.deepEqual(unavailablePlugin.writes, ["/deck/3"]);
  assert.deepEqual(unavailablePlugin.errors, []);
  unavailablePlugin.sync.destroy();

  let finishSwitch!: () => void;
  const disposed = harness({
    async switchScene() {
      await new Promise<void>(resolve => {
        finishSwitch = resolve;
      });
    },
  });
  disposed.sync.renderEnd(1, a);
  disposed.sync.renderEnd(2, a);
  disposed.sync.destroy();
  finishSwitch();
  await tick();
  disposed.sync.renderEnd(3, a);
  assert.deepEqual(disposed.writes, ["/deck/1"], "destroy discards queued and later renders");
  [sender, slow, reader, creator, restored, partial, follower, serial].forEach(h =>
    h.sync.destroy()
  );
  console.log("SceneSync shared ownership, initialization, coalescing and lifecycle passed");
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
