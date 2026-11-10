const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { buildSync } = require("esbuild");

const compiled = buildSync({
  stdin: {
    contents: 'export * from "./src/logger"; export * from "./src/utils"; export * from "./src/sync";',
    resolveDir: path.resolve(__dirname, ".."),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
}).outputFiles[0].text;
const compiledModule = { exports: {} };
new Function("module", "exports", compiled)(compiledModule, compiledModule.exports);
const { createPlyrLogger, Sync, safePlay, loadHLS } = compiledModule.exports;

function captureLogger() {
  const calls = [];
  const logger = {};
  for (const level of ["debug", "info", "warn", "error"]) {
    logger[level] = function (...messages) {
      assert.equal(this, logger, "SDK logger receiver must be preserved");
      calls.push({ level, messages });
    };
  }
  return { logger, calls };
}

function context(appId, room, displayer = room) {
  return { appId, getRoom: () => room, getDisplayer: () => displayer };
}

test("room logger receives every level and readable details, ahead of displayer logger", () => {
  const room = captureLogger(), displayer = captureLogger();
  const logger = createPlyrLogger(context("youtube-A", room, displayer));
  const details = { source: "command", state: [true, 0, 1000] };
  for (const level of ["debug", "info", "warn", "error"]) logger[level]("event", details);
  assert.deepEqual(room.calls.map(call => call.level), ["debug", "info", "warn", "error"]);
  for (const call of room.calls) {
    assert.equal(call.messages[0], "[Plyr] event");
    assert.deepEqual(JSON.parse(call.messages[1]), details);
  }
  assert.equal(displayer.calls.length, 0);
});

test("multiple Apps retain their own room logger", () => {
  const roomA = captureLogger(), roomB = captureLogger();
  const loggerA = createPlyrLogger(context("A", roomA));
  const loggerB = createPlyrLogger(context("B", roomB));
  loggerB.info("ready");
  loggerA.info("pause");
  loggerB.info("destroy");
  assert.deepEqual(roomA.calls.map(call => call.messages[0]), ["[Plyr] pause"]);
  assert.deepEqual(roomB.calls.map(call => call.messages[0]), ["[Plyr] ready", "[Plyr] destroy"]);
});

test("legacy component prefixes are normalized exactly once without losing fields", () => {
  const room = captureLogger();
  const logger = createPlyrLogger(context("A", room));
  const details = { volume: 0.5, muted: false };
  for (const message of ["ready", "[Plyr] ready", "[Plyr]: ready", "[Plyr] [Plyr]: ready"]) {
    logger.info(message, details);
  }
  assert.equal(room.calls.length, 4, "prefix normalization must not drop distinct log calls");
  for (const call of room.calls) {
    assert.equal(call.messages[0], "[Plyr] ready");
    assert.deepEqual(JSON.parse(call.messages[1]), details);
  }
});

test("replay uses its displayer logger when no live room exists", () => {
  const player = captureLogger();
  createPlyrLogger(context("replay", undefined, player)).warn("seek failed");
  assert.equal(player.calls[0].messages[0], "[Plyr] seek failed");
});

test("missing SDK logger falls back to console", t => {
  const warn = t.mock.method(console, "warn", () => {});
  createPlyrLogger(context("missing", undefined, {})).warn("unavailable");
  assert.deepEqual(warn.mock.calls[0].arguments, ["[Plyr] unavailable"]);
});

test("a failing SDK logger cannot interrupt a playback callback", t => {
  const error = t.mock.method(console, "error", () => {});
  const logger = createPlyrLogger(context("fault", { logger: { error() { throw Error("logger closed"); } } }));
  assert.doesNotThrow(() => logger.error("player failed", { code: 100 }));
  assert.deepEqual(error.mock.calls[0].arguments, ["[Plyr] player failed", '{"code":100}']);
});

test("legacy Sync routes state and local input logs to its room logger", () => {
  const room = { ...captureLogger(), uid: "A", calibrationTimestamp: 1000 };
  const state = { owner: "B", paused: true, muted: false, volume: 0.4, currentTime: 0 };
  const ctx = {
    ...context("legacy", room),
    storage: {
      state,
      setState(update) { Object.assign(state, update); },
      addStateChangedListener() { return () => {}; },
    },
  };
  const sync = new Sync(ctx);
  sync.player = { once() {}, paused: true, muted: false, volume: 1, currentTime: 0 };
  sync.syncAll();
  assert.equal(sync.player.volume, 0.4);
  sync.dispatchOwner();
  assert.equal(state.owner, "A");
  assert.deepEqual(room.calls.map(call => call.messages[0]), [
    "[Plyr] < sync volume", "[Plyr] > set owner",
  ]);
  sync.dispose();
});

test("muted autoplay fallback retains playback behavior and reports through room logger", async () => {
  const room = captureLogger();
  const logger = createPlyrLogger(context("autoplay", room));
  const denied = Error("autoplay denied");
  let attempts = 0;
  const player = { muted: false, async play() { if (++attempts === 1) throw denied; } };
  assert.equal(await safePlay(player, logger), false);
  assert.equal(player.muted, true);
  assert.equal(attempts, 2);
  assert.equal(room.calls[0].level, "debug");
  assert.equal(JSON.parse(room.calls[0].messages[1]).message, denied.message);
});

test("HLS initialization failures retain the existing fallback and use room logger", async t => {
  const room = captureLogger();
  const previous = global.window;
  t.after(() => { if (previous === undefined) delete global.window; else global.window = previous; });
  global.window = { Hls: class { constructor() { throw Error("HLS unavailable"); } } };
  const hls = await loadHLS(createPlyrLogger(context("hls", room)));
  assert.equal(typeof hls.loadSource, "function");
  assert.equal(typeof hls.attachMedia, "function");
  assert.equal(room.calls[0].level, "debug");
  assert.equal(JSON.parse(room.calls[0].messages[1]).message, "HLS unavailable");
});

test("SDK string coercion retains nested playback targets and primitive arguments", () => {
  const calls = [];
  const logger = createPlyrLogger(context("A", { logger: { info(...args) { calls.push(args.join(" ")); } } }));
  logger.info("[Plyr] YouTube playback target", {
    id: "1:2", author: "teacher", source: "native", state: [false, 1000], rate: 1,
  }, false, 0);
  assert.equal(calls[0], '[Plyr] YouTube playback target {"id":"1:2","author":"teacher","source":"native","state":[false,1000],"rate":1} false 0');
  assert.ok(!calls[0].includes("[object Object]"));
});

test("error and circular details remain safe and readable", () => {
  const room = captureLogger();
  const logger = createPlyrLogger(context("A", room));
  const details = { value: 2n, error: Error("play denied") };
  details.self = details;
  assert.doesNotThrow(() => logger.warn("fallback", details));
  const result = JSON.parse(room.calls[0].messages[1]);
  assert.equal(result.value, "2");
  assert.equal(result.error.message, "play denied");
  assert.match(result.error.stack, /play denied/);
  assert.equal(result.self, "[Circular]");
  assert.doesNotThrow(() => logger.info("bad detail", { toJSON() { throw Error("cannot serialize"); } }));
  assert.equal(room.calls[1].messages[1], "[Unserializable]");
});
