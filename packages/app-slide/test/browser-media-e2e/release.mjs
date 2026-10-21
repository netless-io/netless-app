import { PAUSED_POSITION_TOLERANCE_SECONDS } from "./acceptance.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(
  process.env.APP_SLIDE_E2E_OUTPUT || path.join(root, ".results", "release-" + Date.now())
);
await fs.mkdir(output, { recursive: true });
const releaseState = {
  passed: false,
  status: "running",
  runId: "app-release-" + Date.now(),
  startedAt: new Date().toISOString(),
  reports: [],
};
async function saveRelease() {
  const file = path.join(output, "release.json");
  await fs.writeFile(file + ".tmp", JSON.stringify(releaseState, null, 2) + "\n");
  await fs.rename(file + ".tmp", file);
}
await saveRelease();
try {
  assert.ok(
    !process.env.APP_SLIDE_E2E_DIAGNOSTIC,
    "Diagnostic subsets cannot satisfy a release gate"
  );
  assert.ok(
    !process.env.SLIDE_CANDIDATE_DIR,
    "Publish against the pinned npm Slide package, not a local alias"
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
    assert.equal(report.appRebuilt, true, "Each profile must build the selected npm Slide input");
    assert.equal(report.slideArtifact, "installed-npm");
    assert.equal(report.scope, "full");
    assert.equal(report.matrixComplete, true);
    assert.equal(report.pausedPositionToleranceSeconds, PAUSED_POSITION_TOLERANCE_SECONDS);
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
          "video-release-delayed-audio-follows-room-clock",
          "video-release-delayed-audio-pause",
          "animation-step",
        ]) {
          assert.ok(
            report.cases.some(c => c.label === `${mode}/${backend}/${name}`),
            "Required real-room scenario: " + name
          );
        }
        const deck = report.customerDeckChecks?.find(c => c.prefix === `${mode}/${backend}`);
        assert.ok(deck && Number.isInteger(deck.actualPageCount) && deck.actualPageCount > 0);
        assert.equal(deck.expectedPageCount, deck.actualPageCount);
        assert.deepEqual(
          deck.pages,
          Array.from({ length: deck.actualPageCount }, (_, i) => i + 1)
        );
        for (let page = 2; page <= deck.actualPageCount; page++) {
          const row = report.cases.find(
            c => c.label === `${mode}/${backend}/customer-page-${page}`
          );
          assert.ok(
            row &&
              row.rows.length === 3 &&
              row.rows.every(
                s => s.page === page && s.renderedPage === page && s.storagePage === page
              )
          );
        }
        const delayedAudio = report.cases.find(
          c => c.label === `${mode}/${backend}/video-release-delayed-audio-follows-room-clock`
        );
        assert.ok(delayedAudio.delayMs >= 18000 && delayedAudio.delayedAudioRequests > 0);
        for (const s of [delayedAudio.ready, delayedAudio.beforeBytes]) {
          assert.equal(s.mediaType, "video");
          assert.ok(s.videoReadyState >= 1 && s.videoDuration > 0);
          assert.equal(s.howlState, "loading");
          assert.equal(s.audioPaused, true);
          assert.equal(s.audioExecution?.desiredPlaying, true);
          assert.equal(s.engineMediaState?.type, "play");
          assert.equal(s.storageMediaState?.type, "play");
          assert.ok(!s.mediaFailure);
        }
        if (backend === "html5")
          for (const kind of ["audio", "video"]) {
            assert.ok(
              report.cases.some(
                c => c.label === `${mode}/${backend}/${kind}/native-seeking-unlocked-pause`
              ),
              "Real unlocked native seeking acceptance is required"
            );
            const window = report.nativeSeekWindows?.find(
              w => w.prefix === `${mode}/${backend}` && w.kind === kind
            );
            assert.equal(window?.observed.audioNodeSeeking, true);
            if (kind === "video") assert.equal(window?.observed.videoSeeking, true);
            assert.equal(window?.observed.howlLock, false);
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
        for (const index of [1, 2]) {
          const replay = report.trimReplayChecks?.find(
            c => c.prefix === `${mode}/${backend}` && c.index === index
          );
          assert.ok(replay, "Replay needs an independent zero-offset play anchor");
          assert.ok(
            replay.request.state.time >= replay.request.requestedAt - 200 &&
              replay.request.state.time <= replay.request.completedAt + 1
          );
          assert.ok(
            replay.before.every(
              s =>
                Math.abs(s.audioTime - s.trimStart) < 0.2 &&
                (s.mediaType !== "video" || Math.abs(s.videoTime - s.trimStart) < 0.2)
            )
          );
        }
        const animation = report.cases.find(c => c.label === `${mode}/${backend}/animation-step`);
        assert.equal(animation.steps?.length, 2, "Two actual animation steps must finish");
        for (const step of animation.steps) {
          assert.equal(step.after.length, 3);
          assert.ok(
            step.after.every(
              s =>
                s.mainSeqStep === step.expected &&
                s.storageMainSeqStep === step.expected &&
                s.mainSeqState === "end" &&
                s.storageMainSeqState === "end"
            )
          );
          assert.ok(
            step.pixelsBefore.every(
              (frame, i) =>
                frame.bytes > 0 &&
                step.pixelsAfter[i].bytes > 0 &&
                frame.hash !== step.pixelsAfter[i].hash
            )
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
  Object.assign(releaseState, { passed: true, status: "passed", reports });
} catch (error) {
  Object.assign(releaseState, { passed: false, status: "failed", error: error.message });
  throw error;
} finally {
  releaseState.finishedAt = new Date().toISOString();
  await saveRelease();
}
