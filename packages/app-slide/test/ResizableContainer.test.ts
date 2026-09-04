import { ResizableContainer } from "../src/DocsViewer/ResizableContainer";

type TestContainer = {
  enableResize: boolean;
  layoutFrameId?: number;
  scale: number;
  scaleChangedListeners: Set<(scale: number) => void>;
  scrollContainer: { style: Record<string, string> };
  getScale(): number;
  scaleContainer(scale: number): void;
  destroy(): void;
  updateResizableContainer(): void;
};

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertArrayEqual(actual: unknown[], expected: unknown[], message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function installFrameScheduler() {
  let nextFrameId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = callback => {
    const frameId = nextFrameId++;
    callbacks.set(frameId, callback);
    return frameId;
  };
  globalThis.cancelAnimationFrame = frameId => {
    callbacks.delete(frameId);
  };

  return {
    get pendingCount() {
      return callbacks.size;
    },
    flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(performance.now());
    },
    restore() {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    },
  };
}

function createContainer(onLayout: () => void): TestContainer {
  const container = Object.create(ResizableContainer.prototype) as unknown as TestContainer;
  container.enableResize = true;
  container.scale = 1;
  container.scaleChangedListeners = new Set();
  container.scrollContainer = { style: {} };
  container.updateResizableContainer = onLayout;
  return container;
}

function testLatestScaleFrame(): void {
  const scheduler = installFrameScheduler();
  let layoutCount = 0;
  const observedScales: number[] = [];
  const container = createContainer(() => layoutCount++);
  container.scaleChangedListeners.add(scale => observedScales.push(scale));

  try {
    container.scaleContainer(1.5);
    container.scaleContainer(2);
    container.scaleContainer(3);

    assertEqual(container.getScale(), 3, "latest scale");
    assertEqual(scheduler.pendingCount, 1, "pending frame count");
    assertArrayEqual(observedScales, [1.5, 2, 3], "observed scales");

    scheduler.flush();
    assertEqual(layoutCount, 1, "layout count after flush");
    assertEqual(scheduler.pendingCount, 0, "pending frame count after flush");

    container.scaleContainer(3);
    assertEqual(scheduler.pendingCount, 0, "same-scale frame count");
  } finally {
    scheduler.restore();
  }
}

function testDestroyCancelsFrame(): void {
  const scheduler = installFrameScheduler();
  let layoutCount = 0;
  const container = createContainer(() => layoutCount++);

  try {
    container.scaleContainer(2);
    assertEqual(scheduler.pendingCount, 1, "pending frame before destroy");

    container.destroy();
    assertEqual(scheduler.pendingCount, 0, "pending frame after destroy");

    scheduler.flush();
    assertEqual(layoutCount, 0, "layout count after destroy");
  } finally {
    scheduler.restore();
  }
}

testLatestScaleFrame();
testDestroyCancelsFrame();
