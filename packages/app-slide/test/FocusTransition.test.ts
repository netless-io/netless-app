import { strict as assert } from "node:assert";
import {
  createFocusTransitionQueue,
  shouldSlideRuntimeBeActive,
} from "../src/utils/focus-transition";

const flush = async (): Promise<void> => {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(next => {
    resolve = next;
  });
  return { promise, resolve };
};

async function run(): Promise<void> {
  {
    let focused = false;
    let visible = true;
    const active = () => shouldSlideRuntimeBeActive(focused, visible, false);

    assert.equal(active(), false, "a visible but unfocused slide stays frozen");
    visible = false;
    focused = true;
    assert.equal(active(), false, "focus received in the background does not unfreeze");
    visible = true;
    assert.equal(active(), true, "the focused slide unfreezes when the tab returns");
    assert.equal(
      shouldSlideRuntimeBeActive(true, true, true),
      false,
      "a minimized slide stays frozen even when focused and visible"
    );
  }

  {
    const calls: boolean[] = [];
    const transition = createFocusTransitionQueue(true, focused => {
      calls.push(focused);
    });

    transition(true);
    transition(true);
    await flush();
    assert.deepEqual(calls, [], "initial focused duplicates are ignored");

    transition(false);
    transition(false);
    transition(false);
    await flush();
    assert.deepEqual(calls, [false], "duplicate blur is applied once");
  }

  {
    const calls: string[] = [];
    const freeze = deferred();
    const transition = createFocusTransitionQueue(true, async focused => {
      calls.push(focused ? "unfreeze:start" : "freeze:start");
      if (!focused) await freeze.promise;
      calls.push(focused ? "unfreeze:end" : "freeze:end");
    });

    const freezing = transition(false);
    const unfreezing = transition(true);
    const duplicateUnfreezing = transition(true);
    await flush();
    assert.deepEqual(calls, ["freeze:start"], "unfreeze waits for in-flight freeze");

    freeze.resolve();
    await Promise.all([freezing, unfreezing, duplicateUnfreezing]);
    assert.deepEqual(
      calls,
      ["freeze:start", "freeze:end", "unfreeze:start", "unfreeze:end"],
      "opposite transitions run once and in order"
    );
  }

  {
    const calls: boolean[] = [];
    const transition = createFocusTransitionQueue(true, focused => {
      calls.push(focused);
    });

    transition(false);
    transition(true);
    transition(false);
    await flush();
    assert.deepEqual(calls, [false, true, false], "all opposite transitions are preserved");
  }

  {
    const calls: boolean[] = [];
    const errors: unknown[] = [];
    let fail = true;
    const transition = createFocusTransitionQueue(
      true,
      focused => {
        calls.push(focused);
        if (fail) {
          fail = false;
          throw new Error("freeze failed");
        }
      },
      error => errors.push(error)
    );

    await assert.rejects(transition(false), /freeze failed/);
    await transition(false);
    assert.deepEqual(calls, [false, false], "the latest failed state can be retried");
    assert.equal(errors.length, 1, "failed transition is reported once");
  }

  {
    const calls: boolean[] = [];
    const errors: unknown[] = [];
    const transition = createFocusTransitionQueue(
      true,
      focused => {
        calls.push(focused);
        if (!focused) throw new Error("freeze failed");
      },
      error => errors.push(error)
    );

    const failedFreeze = transition(false);
    const unfreeze = transition(true);
    await assert.rejects(failedFreeze, /freeze failed/);
    await unfreeze;
    assert.deepEqual(calls, [false, true], "a failed transition does not poison the queue");
    assert.equal(errors.length, 1, "transition error is reported once");
  }

  {
    const release = deferred();
    const transition = createFocusTransitionQueue(false, async focused => {
      assert.equal(focused, true);
      await release.promise;
    });

    let firstSettled = false;
    let duplicateSettled = false;
    const first = transition(true).then(() => {
      firstSettled = true;
    });
    const duplicate = transition(true).then(() => {
      duplicateSettled = true;
    });
    await flush();
    assert.equal(firstSettled, false, "focus waits for unfreeze completion");
    assert.equal(duplicateSettled, false, "duplicate focus shares the completion barrier");

    release.resolve();
    await Promise.all([first, duplicate]);
    assert.equal(firstSettled, true);
    assert.equal(duplicateSettled, true);
  }
}

void run();
