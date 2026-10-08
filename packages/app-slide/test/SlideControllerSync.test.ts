import assert from "node:assert/strict";

(global as any).window = { addEventListener() {}, removeEventListener() {} };
(global as any).document = {
  visibilityState: "visible",
  addEventListener() {},
  removeEventListener() {},
};
const { SlideControllerBase } = require("../src/SlideController");

class Controller extends SlideControllerBase {
  constructor(props: any) {
    super(props);
    this.slide = this.createSlide({});
    this.registerEventListeners();
  }
}

const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
async function main() {
  const sceneWrites: string[] = [],
    stateWrites: any[] = [],
    outgoing: any[] = [];
  let writable = true,
    receive: (event: any) => void = () => {};
  const room = {
    uid: "00002345",
    observerId: 11,
    scenePathType: () => "page",
    logger: { info() {}, debug() {}, warn() {} },
  };
  const manager: any = { emitter: { on() {}, off() {} } };
  const context: any = {
    appId: "app-a",
    isAddApp: false,
    getRoom: () => room,
    getDisplayer: () => room,
    getIsWritable: () => writable,
    getAppOptions: () => ({ bgColor: "#fff" }),
    getWindowManager: () => manager,
    getInitScenePath: () => "/deck",
    async setScenePath(path: string) {
      sceneWrites.push(path);
    },
    getBoxStatus: () => undefined,
    dispatchMagixEvent: (...args: any[]) => outgoing.push(args),
    addMagixEventListener: (_name: string, fn: (event: any) => void) => {
      receive = fn;
      return () => {};
    },
    storage: {
      state: {},
      ensureState() {},
      addStateChangedListener: () => () => {},
      setState: (value: any) => stateWrites.push(value),
    },
    emitter: { off() {} },
  };
  let ends = 0;
  const c = new Controller({
    context,
    onRenderStart() {},
    onRenderEnd() {
      ends++;
    },
    onPageChanged() {},
    onTransitionStart() {},
    onTransitionEnd() {},
    onError() {},
  });
  // Avoid creating unrelated readiness timers; this test starts at a ready controller.
  c.ready = true;
  assert.equal(c.slide.config.clientId, "00002345", "suid preserves leading zeros");
  assert.equal(c.slide.config.mode, "interactive");
  let received: any;
  c.slide.on("syncReceive", (value: any) => {
    received = value;
  });
  const payload = {
    type: "renderSlide",
    index: 3,
    slideIndex: 1,
    clientId: "customer",
    authorId: 99,
  };
  receive({ authorId: 11, payload: { type: "syncDispatch", payload } });
  assert.equal(received.authorId, 11);
  assert.equal(received.clientId, "customer");
  assert.equal(payload.authorId, 99);
  c.slide.emit("renderEnd", 3, received);
  await tick();
  assert.deepEqual(sceneWrites, ["/deck/3"]);
  const state = { currentSlideIndex: 3 };
  c.slide.emit("stateChange", state, received);
  c.slide.emit("stateChange", state, { authorId: 22, clientId: room.uid });
  c.slide.emit("stateChange", state);
  writable = false;
  c.slide.emit("stateChange", state, received);
  assert.deepEqual(stateWrites, [{ state }]);
  const local: string[][] = [];
  manager._appliancePlugin = {
    currentManager: { viewContainerManager: { getView: () => ({}) } },
    async setViewLocalScenePathChange(...args: string[]) {
      local.push(args);
    },
  };
  c.slide.emit("renderEnd", 2, { authorId: 22 });
  await tick();
  assert.deepEqual(local, [["/deck/2", "app-a"]]);
  assert.equal(ends, 2, "render callbacks registered immediately");
  await c.destroy();
  console.log("Controller: suid/clientId, transport author, state ownership and local view passed");
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
