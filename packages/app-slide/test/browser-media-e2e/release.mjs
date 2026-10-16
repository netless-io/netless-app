import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
assert.ok(
  !process.env.APP_SLIDE_E2E_DIAGNOSTIC,
  "Diagnostic subsets cannot satisfy a release gate"
);
assert.ok(
  !process.env.SLIDE_CANDIDATE_DIR,
  "Publish against the pinned npm Slide package, not a local alias"
);
const output = path.resolve(
  process.env.APP_SLIDE_E2E_OUTPUT || path.join(root, ".results", "release-" + Date.now())
);
const reports = [];
for (const [engine, autoplay] of [
  ["chromium", "allowed"],
  ["chromium", "blocked"],
  ["webkit", "allowed"],
]) {
  const runOutput = path.join(output, engine + "-" + autoplay);
  const child = spawnSync(process.execPath, [path.join(root, "run.mjs")], {
    stdio: "inherit",
    env: {
      ...process.env,
      APP_SLIDE_E2E_OUTPUT: runOutput,
      APP_SLIDE_E2E_BROWSER: engine,
      APP_SLIDE_E2E_AUTOPLAY: autoplay,
    },
  });
  assert.equal(child.status, 0, engine + "/" + autoplay + " acceptance failed");
  const file = path.join(
    runOutput,
    engine === "webkit" ? "webkit" : autoplay === "blocked" ? "autoplay-blocked" : "",
    "results.json"
  );
  const report = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(report.passed, true);
  assert.equal(report.scope, "full");
  assert.equal(report.matrixComplete, true);
  assert.equal(report.cleanup.length, 4);
  assert.ok(report.cleanup.every(r => r.isBan && r.isRecord === false));
  for (const mode of ["1.0", "1.5"])
    for (const backend of ["html5", "webaudio"]) {
      for (const name of [
        "frozen-page-change-release",
        "close-app-while-playing-no-ghost-audio",
        "multiple-media-rapid-independent-signals",
        "media-http-retry-after-recreate",
        "real-pointer-progress-pause",
      ]) {
        assert.ok(
          report.cases.some(c => c.label === `${mode}/${backend}/${name}`),
          "Required real-room scenario: " + name
        );
      }
      for (const kind of ["audio", "video"])
        for (const name of [
          "deterministic-native-seek-cancel",
          "release-writable-readonly-follow-play",
          "release-author-follows-latest-pause",
          "all-clients-release-follow-room-clock",
          "paused-frozen-release-stays-paused",
          "refreeze-during-playing-release",
          "reconnect-while-playing",
          "trim-seek-pause",
          "trim-natural-end",
          "trim-replay-pause",
        ]) {
          assert.ok(
            report.cases.some(c => c.label === `${mode}/${backend}/${kind}/${name}`),
            "Required real-media frozen/release scenario: " + name
          );
        }
    }
  reports.push({
    engine,
    autoplay,
    cases: report.cases.length,
    appSHA256: report.appSHA256,
    slideSHA256: report.slideSHA256,
  });
}
assert.ok(
  reports.every(
    r => r.appSHA256 === reports[0].appSHA256 && r.slideSHA256 === reports[0].slideSHA256
  ),
  "Every browser must test the same artifact"
);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(
  path.join(output, "release.json"),
  JSON.stringify({ passed: true, reports }, null, 2) + "\n"
);
