import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { installNativeProbe } from "./native-probe.mjs";
import { extendedCoverage } from "./coverage.mjs";
import { boundaryCoverage } from "./boundaries.mjs";
import { volumeCoverage } from "./volume.mjs";
import { installPassiveEvaluation } from "./passive-page.mjs";
import {
  PAUSED_POSITION_TOLERANCE_SECONDS,
  matchesPausedPosition,
  GRAPHICS_CONTEXT_POLICY,
  isGraphicsContextNotice,
} from "./acceptance.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(root, "../../../..");
const browserEngine = process.env.APP_SLIDE_E2E_BROWSER || "chromium";
const blockedAutoplay = process.env.APP_SLIDE_E2E_AUTOPLAY === "blocked";
const diagnostic = process.env.APP_SLIDE_E2E_DIAGNOSTIC;
const diagnosticBackend = process.env.APP_SLIDE_E2E_DIAGNOSTIC_BACKEND || "html5";
const diagnosticMode = process.env.APP_SLIDE_E2E_DIAGNOSTIC_MODE || "1.0";
const output = path.resolve(
  (process.env.APP_SLIDE_E2E_OUTPUT || path.join(root, ".results", String(Date.now()))) +
    (browserEngine !== "chromium"
      ? "/" + browserEngine
      : blockedAutoplay
      ? "/autoplay-blocked"
      : "")
);
const runId = "app-media-" + Date.now();
const result = {
  startedAt: new Date().toISOString(),
  runId,
  passed: false,
  status: "initializing",
  cases: [],
  cleanup: [],
  browserErrors: [],
  notRun: [],
  browserEngine,
  blockedAutoplay,
  scope: diagnostic ? "diagnostic/" + diagnostic : "full",
  sharedMediaVolumeMode:
    process.env.APP_SLIDE_E2E_VOLUME_MODE || (diagnostic === "volume" ? "enabled" : "default"),
  matrixComplete: false,
  pausedPositionToleranceSeconds: PAUSED_POSITION_TOLERANCE_SECONDS,
  graphicsContextPolicy: GRAPHICS_CONTEXT_POLICY,
};
async function saveResult() {
  await fs.mkdir(output, { recursive: true });
  const file = path.join(output, "results.json");
  await fs.writeFile(file + ".tmp", JSON.stringify(result, null, 2) + "\n");
  await fs.rename(file + ".tmp", file);
}
// Invalidate an earlier success before resolving dependencies or candidate files.
await saveResult();
let config, pkg, leaf, slideEntry, slidePkg, build, engines;
try {
  const require = createRequire(path.join(project, "package.json"));
  ({ build } = require("vite"));
  engines = process.env.APP_SLIDE_PLAYWRIGHT
    ? createRequire(import.meta.url)(process.env.APP_SLIDE_PLAYWRIGHT)
    : require("playwright");
  pkg = JSON.parse(
    await fs.readFile(path.join(project, "packages/app-slide/package.json"), "utf8")
  );
  leaf = createRequire(path.join(project, "packages/app-slide/package.json"));
  slideEntry = process.env.SLIDE_CANDIDATE_DIR
    ? path.join(process.env.SLIDE_CANDIDATE_DIR, "lib/Slide.js")
    : leaf.resolve("@netless/slide");
  slidePkg = JSON.parse(
    await fs.readFile(path.join(path.dirname(slideEntry), "../package.json"), "utf8")
  );
  Object.assign(result, {
    status: "running",
    appVersion: pkg.version,
    slideVersion: slidePkg.version,
    slideArtifact: process.env.SLIDE_CANDIDATE_DIR ? "local-unreleased-candidate" : "installed-npm",
    versions: Object.fromEntries(
      ["white-web-sdk", "@netless/window-manager", "@netless/appliance-plugin"].map(name => [
        name,
        leaf(name + "/package.json").version,
      ])
    ),
  });
} catch (error) {
  result.status = "failed";
  result.error = error.message;
  result.finishedAt = new Date().toISOString();
  await saveResult();
  throw error;
}
await saveResult();
const rooms = new Map();
let server, browser, origin;
const appDist = path.join(project, "packages/app-slide/dist");

async function verifyNativeAudioEnvironment() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const sampleNative = () =>
    page.evaluate(() => ({
      time: window.a.currentTime,
      paused: window.a.paused,
      ready: window.a.readyState,
      playState: window.playState,
    }));
  try {
    await page.goto(origin + "/media-environment-check");
    await page.click("#play");
    await page.waitForFunction(() => window.a.currentTime > 0.1 && !window.a.paused, null, {
      timeout: 15000,
      polling: 50,
    });
    result.nativeEnvironment = { passed: true, observed: await sampleNative() };
  } catch (error) {
    result.nativeEnvironment = { passed: false, observed: await sampleNative() };
    throw Error(
      "Native audio environment did not advance before any room was created: " + error.message
    );
  } finally {
    await page
      .evaluate(() => {
        window.a?.pause();
        window.a?.removeAttribute("src");
        window.a?.load();
      })
      .catch(() => {});
    await context.close();
  }
}

async function api(endpoint, method = "GET", body) {
  const attempts = method === "POST" ? 1 : 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch("https://api.netless.link/v5/" + endpoint, {
        method,
        headers: {
          token: config.sdkToken,
          region: config.region || "cn-hz",
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw Error("Test-room API " + method + " HTTP " + response.status);
      return response.json();
    } catch (error) {
      if (attempt === attempts - 1) throw error;
    }
  }
}
function fixture(index, scenario = "") {
  if (diagnostic === "volume" && index === 2) scenario += "-multiple";
  const type = index === 1 ? "video" : "audio";
  const data = {
    type: "Stage",
    width: 640,
    height: 360,
    slideCount: 3,
    index,
    show: true,
    children:
      index === 3
        ? []
        : [
            {
              type: "Picture",
              id: "fixture-" + type,
              width: 600,
              height: 320,
              position: { x: 20, y: 20 },
              rotation: 0,
              flipScale: { x: 1, y: 1 },
              picFill: { fillType: "blipFill", src: "poster", filters: [] },
              media: { type, src: origin + "/fixture/media." + (type === "video" ? "mp4" : "mp3") },
            },
          ],
    featureList: { filter: [], effect: [], smartArt: [] },
    smartArtShapeList: [],
    coloredSheets: index === 3 ? [] : ["sheet"],
  };
  if (scenario.includes("cut") && data.children[0]) {
    data.children[0].media.src = origin + "/fixture/short." + (type === "video" ? "mp4" : "mp3");
    data.children[0].media.cut = { start: 3, end: 15 };
  }
  if (scenario.includes("multiple") && data.children[0]) {
    data.children[0].width = 270;
    const second = structuredClone(data.children[0]);
    second.id += "-second";
    second.position.x = 330;
    second.media.src = origin + "/fixture/second." + (type === "video" ? "mp4" : "mp3");
    data.children.push(second);
  }
  if (scenario.includes("failure") && data.children[0]) {
    data.children[0].media.src = origin + "/fixture/retry." + (type === "video" ? "mp4" : "mp3");
  }
  // Pictures require a real shape mask; an empty geometry hides the video
  // even when its native element keeps decoding and advancing.
  for (const picture of data.children) {
    const { width, height } = picture;
    const hash = `fixture-${width}-${height}`;
    picture.geometry = {
      hash,
      paths: [
        {
          id: "fixture-rect",
          hash,
          fill: "norm",
          hasStroke: false,
          scale: { x: 1, y: 1 },
          path: `M 0,0 L ${width * 100},0 L ${width * 100},${height * 100} L 0,${
            height * 100
          } C 0,0`,
        },
      ],
    };
  }
  return data;
}
async function start() {
  await fs.mkdir(output, { recursive: true });
  server = http.createServer();
  const hostDist = path.join(output, "host");
  await build({
    root,
    configFile: false,
    define: { "import.meta.env.DEV": "false" },
    cacheDir: path.join(output, ".vite"),
    resolve: {
      dedupe: ["white-web-sdk", "@netless/window-manager"],
      alias: {
        "@netless/appliance-plugin": path.dirname(
          leaf.resolve("@netless/appliance-plugin/package.json")
        ),
      },
    },
    build: {
      target: "esnext",
      outDir: hostDist,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
    },
  });
  server.on("request", async (req, res) => {
    try {
      const url = new URL(req.url || "/", origin);
      res.setHeader("Cache-Control", "no-store");
      if (url.pathname === "/favicon.ico") {
        res.writeHead(204);
        return res.end();
      }
      if (url.pathname === "/") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(await fs.readFile(path.join(hostDist, "index.html")));
      }
      if (url.pathname === "/__config") {
        const room = rooms.get(
          url.searchParams.get("mode") + "/" + url.searchParams.get("backend")
        );
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({
            sharedMediaVolumeMode: result.sharedMediaVolumeMode,
            appIdentifier: config.appIdentifier,
            region: config.region || "cn-hz",
            runId,
            ...room,
          })
        );
      }
      if (["/app/main.es.js", "/app/main.iife.js"].includes(url.pathname)) {
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        return res.end(await fs.readFile(path.join(appDist, path.basename(url.pathname))));
      }
      if (url.pathname === "/old/main.iife.js") {
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        return res.end(await fs.readFile(config.oldIifePath));
      }
      const index = url.pathname.match(/\/slide-([123])\.json$/)?.[1];
      if (url.pathname === "/media-environment-check") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(
          '<button id="play">play</button><script>window.a=new Audio("/fixture/media.mp3");a.preload="auto";document.querySelector("button").onclick=()=>{window.playState="pending";a.play().then(()=>window.playState="resolved",e=>window.playState=e.name)};</script>'
        );
      }
      if (url.pathname.startsWith("/fixture/") && index) {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify(fixture(Number(index), url.pathname)));
      }
      if (url.pathname.startsWith("/fixture/") && url.pathname.endsWith("/sheet.json")) {
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({
            frames: {
              poster: {
                frame: { x: 0, y: 0, w: 1, h: 1 },
                rotated: false,
                trimmed: false,
                spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 },
                sourceSize: { w: 1, h: 1 },
              },
            },
            meta: { image: "sheet.png", scale: "1" },
          })
        );
      }
      if (url.pathname.startsWith("/fixture/") && url.pathname.endsWith(".png")) {
        res.setHeader("Content-Type", "image/png");
        return res.end(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=",
            "base64"
          )
        );
      }
      if (
        [
          "/fixture/short.mp4",
          "/fixture/short.mp3",
          "/fixture/media.mp4",
          "/fixture/media.mp3",
          "/fixture/retry.mp4",
          "/fixture/retry.mp3",
          "/fixture/second.mp4",
          "/fixture/second.mp3",
        ].includes(url.pathname)
      ) {
        if (url.pathname.includes("/retry.") && result.injectMediaFailure) {
          result.injectedFailures = (result.injectedFailures || 0) + 1;
          res.writeHead(503);
          return res.end("Intentional media failure");
        }
        const data = await fs.readFile(
          path.join(
            root,
            "fixtures",
            (url.pathname.startsWith("/fixture/short.") ? "short" : "media") +
              path.extname(url.pathname)
          )
        );
        res.setHeader("Content-Type", url.pathname.endsWith("mp4") ? "video/mp4" : "audio/mpeg");
        res.setHeader("Accept-Ranges", "bytes");
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        if (range) {
          const begin = Number(range[1]),
            end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
          res.writeHead(206, {
            "Content-Range": "bytes " + begin + "-" + end + "/" + data.length,
            "Content-Length": end - begin + 1,
          });
          return res.end(data.subarray(begin, end + 1));
        }
        return res.end(data);
      }
      if (url.pathname.startsWith("/assets/")) {
        const filename = path.resolve(hostDist, "." + decodeURIComponent(url.pathname));
        assert.ok(filename.startsWith(hostDist + path.sep));
        const mime = {
          ".js": "application/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".map": "application/json",
          ".wasm": "application/wasm",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
        };
        res.setHeader("Content-Type", mime[path.extname(filename)] || "application/octet-stream");
        return res.end(await fs.readFile(filename));
      }
      res.writeHead(404);
      res.end("Unknown E2E asset");
    } catch {
      res.writeHead(500);
      res.end("E2E resource unavailable");
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
}

async function sample(page) {
  return page.evaluate(() => appMediaGate.sample());
}
async function converged(pages, index, timeout = 90000) {
  await Promise.all(
    pages.map(page =>
      page.waitForFunction(
        ({ index, version }) => {
          const s = window.appMediaGate?.sample();
          return (
            s?.phase === "connected" &&
            s.ready &&
            !s.frozen &&
            !s.loading &&
            s.page === index &&
            s.renderedPage === index &&
            s.storagePage === index &&
            s.scene?.endsWith("/" + index) &&
            s.sharedPath?.endsWith("/" + index) &&
            (s.mode !== "1.5" || s.pluginScene?.endsWith("/" + index)) &&
            s.appVersions.includes(version)
          );
        },
        { index, version: pkg.version },
        { timeout }
      )
    )
  );
  for (const page of pages) {
    const s = await sample(page);
    assert.equal(s.maxRestores <= 1, true);
    assert.deepEqual(s.errors, []);
  }
}
async function checkpoint(label, pages, details = {}) {
  const rows = await Promise.all(pages.map(sample));
  result.cases.push({ label, ...details, rows });
  await saveResult();
  console.log("PASS " + label);
  return rows;
}
async function playing(pages, backend) {
  const recovered = [];
  if (blockedAutoplay || browserEngine === "webkit") {
    await Promise.all(
      pages.map(async page => {
        await page.waitForFunction(
          () => {
            const s = appMediaGate.sample();
            return (
              s.mediaFailure ||
              s.needsGesture ||
              (s.backend === "webaudio" &&
                s.audioContextState === "suspended" &&
                s.engineMediaState?.type === "play") ||
              (s.audioPaused === false &&
                (s.backend === "html5"
                  ? s.audioNodePaused === false
                  : s.audioContextState === "running"))
            );
          },
          null,
          { timeout: 60000 }
        );
        assert.ok(!(await sample(page)).mediaFailure, "Media failed before gesture recovery");
        if (
          (await sample(page)).needsGesture ||
          (await sample(page)).audioContextState === "suspended"
        )
          await page.waitForFunction(
            () => {
              const s = appMediaGate.sample();
              return (
                s.engineMediaState?.type === "play" &&
                s.storageMediaState?.type === "play" &&
                s.engineMediaState.time === s.storageMediaState.time
              );
            },
            null,
            { timeout: 15000 }
          );
        const beforeGesture = await sample(page);
        if (
          beforeGesture.needsGesture ||
          (beforeGesture.backend === "webaudio" && beforeGesture.audioContextState === "suspended")
        ) {
          recovered.push({ page, before: beforeGesture });
          await page.locator("#media-permission").click();
        }
      })
    );
  }
  // Capture readiness and the clock baseline atomically. A late SDK storage
  // delivery can recreate an App between two separate evaluate calls.
  const before = await Promise.all(
    pages.map(async page => {
      const handle = await page.waitForFunction(
        backend => {
          const s = appMediaGate.sample();
          if (s.mediaFailure) return s;
          return s.backend === backend &&
            s.isPlaying &&
            !s.audioNodeSeeking &&
            !s.videoSeeking &&
            !s.audioExecution?.pending &&
            !s.videoExecution?.pending &&
            (backend === "html5"
              ? s.audioNodePaused === false
              : s.webAudioSourceActive && s.audioContextState === "running") &&
            Number.isFinite(s.audioTime) &&
            s.audioPaused === false &&
            (s.mediaType !== "video" ||
              (s.videoPaused === false && s.videoSpriteVisible && s.videoWorldVisible)) &&
            s.engineMediaState?.type === "play" &&
            s.storageMediaState?.type === "play"
            ? s
            : false;
        },
        backend,
        { timeout: 120000 }
      );
      try {
        return await handle.jsonValue();
      } finally {
        await handle.dispose();
      }
    })
  );
  const stableBaselines = [];
  const resets = [];
  const readyForClock = s =>
    s.backend === backend &&
    s.isPlaying &&
    s.audioPaused === false &&
    !s.audioNodeSeeking &&
    !s.videoSeeking &&
    !s.audioExecution?.pending &&
    !s.videoExecution?.pending &&
    (backend === "html5"
      ? s.audioNodePaused === false
      : s.webAudioSourceActive && s.audioContextState === "running") &&
    Number.isFinite(s.audioTime) &&
    (s.mediaType !== "video" ||
      (s.videoPaused === false &&
        s.videoSpriteVisible &&
        s.videoWorldVisible &&
        Math.abs(s.videoTime - s.audioTime) < 1.25)) &&
    s.engineMediaState?.type === "play" &&
    s.storageMediaState?.type === "play" &&
    s.engineMediaState.time === s.storageMediaState.time;
  const identity = s =>
    JSON.stringify([
      s.epoch,
      s.mediaId,
      s.audioSoundId,
      s.webAudioSourceId,
      s.audioExecution?.revision,
      s.videoExecution?.revision,
      s.engineMediaState?.time,
      s.storageMediaState?.time,
    ]);
  try {
    assert.ok(
      before.every(s => !s.mediaFailure),
      "Media preparation failed"
    );
    await Promise.all(
      pages.map(async (page, i) => {
        const deadline = performance.now() + 15000;
        let baseline, capturedAt;
        while (performance.now() < deadline) {
          const current = await sample(page);
          assert.ok(!current.mediaFailure, "Native playback failed");
          if (!readyForClock(current)) {
            baseline = undefined;
          } else if (!baseline || identity(current) !== identity(baseline)) {
            // A real calibration/restore changes the physical attempt. Observe a
            // new settled interval; never count that seek jump as clock progress.
            if (baseline)
              resets.push({
                role: current.role,
                before: identity(baseline),
                after: identity(current),
              });
            baseline = current;
            capturedAt = performance.now();
            stableBaselines[i] = current;
          } else if (
            performance.now() - capturedAt >= 300 &&
            current.audioTime > baseline.audioTime + 0.1 &&
            (current.mediaType !== "video" || current.videoTime > baseline.videoTime + 0.1)
          ) {
            return;
          }
          await page.waitForTimeout(75);
        }
        throw Error("Settled native playback clocks did not advance within 15 seconds");
      })
    );
    if (resets.length) (result.playbackBaselineResets ||= []).push(...resets);
  } catch (error) {
    result.playFailure = {
      before,
      stableBaselines,
      resets,
      after: await Promise.all(pages.map(sample)),
    };
    throw error;
  }
  for (const { page, before } of recovered) {
    const after = await sample(page);
    assert.deepEqual(
      after.storedMediaStates,
      before.storedMediaStates,
      "Gesture recovery changes local playback only"
    );
    assert.equal(after.stateWrites, before.stateWrites, "Gesture recovery must not publish state");
    assert.equal(after.sceneWrites, before.sceneWrites);
    assert.equal(
      after.receivedSignalCount,
      before.receivedSignalCount,
      "Gesture recovery must not emit another play/seek signal"
    );
    result.permissionChecks ||= [];
    result.permissionChecks.push({
      role: after.role,
      mode: after.mode,
      backend,
      requests: after.permissionRequests,
      gestures: after.permissionGestures,
    });
  }
}
async function pauseCounts(pages) {
  return Promise.all(pages.map(async page => (await sample(page)).mediaPauseCount));
}
async function seekWhilePlaying(page, time) {
  const request = await page.evaluate(time => appMediaGate.seek(time), time);
  assert.equal(request.playing, true, "Exercise a seek during actual playback");
  assert.equal(request.state.type, "play");
  assert.ok(
    request.state.time >= request.requestedAt - time * 1000 - 1 &&
      request.state.time <= request.completedAt - time * 1000 + 1,
    "The authored room clock must encode the requested seek position"
  );
  try {
    const handle = await page.waitForFunction(
      request => {
        const s = appMediaGate.sample();
        const elapsed = (s.now - request.state.time) / 1000;
        const position = Math.floor(elapsed) + s.trimStart;
        return s.mediaSeekCount > request.receivedBefore &&
          s.signals.some(
            event =>
              event.type === "mediaSeek" &&
              event.id === request.id &&
              event.state?.type === "play" &&
              event.state.time === request.state.time
          ) &&
          s.engineMediaState?.type === "play" &&
          s.engineMediaState.time === request.state.time &&
          s.storageMediaState?.type === "play" &&
          s.storageMediaState.time === request.state.time &&
          elapsed >= 0 &&
          elapsed < s.clippedDuration &&
          s.isPlaying &&
          !s.audioPaused &&
          !s.audioExecution?.pending &&
          (s.backend !== "html5" || (!s.audioNodeSeeking && !s.audioNodePaused)) &&
          Math.abs(s.audioTime - position) < 1.25 &&
          (s.mediaType !== "video" ||
            (!s.videoPaused &&
              !s.videoSeeking &&
              !s.videoExecution?.pending &&
              Math.abs(s.videoTime - position) < 1.25))
          ? s
          : false;
      },
      request,
      { timeout: 15000 }
    );
    try {
      (result.seekChecks ||= []).push({ request, observed: await handle.jsonValue() });
    } finally {
      await handle.dispose();
    }
  } catch (error) {
    result.seekFailure = { request, after: await sample(page) };
    throw error;
  }
}
async function stopped(label, pages, backend, previousPauses) {
  await Promise.all(
    pages.map((page, i) =>
      page.waitForFunction(
        count => {
          const s = appMediaGate.sample();
          return (
            s.mediaPauseCount > count &&
            s.engineMediaState?.type === "pause" &&
            s.storageMediaState?.type === "pause" &&
            s.isPlaying === false &&
            Math.abs(s.engineMediaState.time - s.storageMediaState.time) < 0.001
          );
        },
        previousPauses[i],
        { timeout: 30000 }
      )
    )
  );
  await pages[0].waitForTimeout(150);
  const samples = [];
  const transientStorage = [];
  result.pauseInProgress = { label, samples, transientStorage };
  const deadline = Date.now() + 15000;
  while (samples.length < 4) {
    assert.ok(
      Date.now() < deadline,
      label + " shared and native pause state must settle and remain consistent for 900ms"
    );
    const rows = await Promise.all(pages.map(sample));
    for (const s of rows) {
      assert.ok(!s.mediaFailure, label + " media failed: " + s.mediaFailure);
      assert.equal(s.backend, backend, label + " requested real backend");
      assert.equal(s.audioPaused, true, label + " audio must stop");
      if (backend === "html5") assert.equal(s.audioNodePaused, true);
      else assert.equal(s.webAudioSourceActive, false);
      if (s.mediaType === "video")
        assert.ok(
          s.videoPaused ||
            (s.quietVideoSeek && s.videoMuted && s.videoVolume === 0 && !s.isPlaying),
          label + " pending video positioning must own a muted decode lease"
        );
    }
    const settled = rows.every(
      s =>
        !s.audioExecution?.pending &&
        !s.videoExecution?.pending &&
        s.engineMediaState?.type === "pause" &&
        s.storageMediaState?.type === "pause" &&
        Math.abs(s.engineMediaState.time - s.storageMediaState.time) < 0.001 &&
        matchesPausedPosition(s.audioTime, s.storageMediaState.time, s.trimStart) &&
        (backend !== "html5" ||
          (!s.audioNodeSeeking &&
            matchesPausedPosition(s.audioNodeTime, s.storageMediaState.time, s.trimStart))) &&
        (s.mediaType !== "video" ||
          (s.videoPaused &&
            !s.videoSeeking &&
            !s.quietVideoSeek &&
            matchesPausedPosition(s.videoTime, s.storageMediaState.time, s.trimStart)))
    );
    if (!settled) {
      result.pauseInProgress.lastUnsettled = rows.map(s => ({
        role: s.role,
        engine: s.engineMediaState,
        storage: s.storageMediaState,
        expected: s.storageMediaState?.time + s.trimStart,
        audioTime: s.audioTime,
        videoTime: s.videoTime,
        audioPaused: s.audioPaused,
        videoPaused: s.videoPaused,
        audioSeeking: s.audioNodeSeeking,
        videoSeeking: s.videoSeeking,
        audioExecution: s.audioExecution,
        videoExecution: s.videoExecution,
      }));
      if (transientStorage.length < 10)
        transientStorage.push(
          rows.map(s => ({
            role: s.role,
            engine: s.engineMediaState,
            storage: s.storageMediaState,
          }))
        );
      samples.length = 0;
      await pages[0].waitForTimeout(300);
      continue;
    }
    samples.push(rows);
    for (const s of rows) {
      assert.equal(s.engineMediaState.type, "pause");
      assert.equal(s.storageMediaState.type, "pause");
      assert.ok(Math.abs(s.engineMediaState.time - s.storageMediaState.time) < 0.001);
      assert.ok(
        matchesPausedPosition(s.audioTime, s.storageMediaState.time, s.trimStart),
        label + " native pause position including trim start"
      );
      assert.ok(s.signals.some(event => event.type === "mediaPause" && event.id === s.mediaId));
    }
    if (samples.length < 4) await pages[0].waitForTimeout(300);
  }
  for (let i = 0; i < pages.length; i++) {
    const audio = samples.map(rows => rows[i].audioTime);
    assert.ok(Math.max(...audio) - Math.min(...audio) < 0.05, label + " audio clock keeps moving");
    if (samples[0][i].mediaType === "video") {
      const video = samples.map(rows => rows[i].videoTime);
      assert.ok(
        Math.max(...video) - Math.min(...video) < 0.05,
        label + " video clock keeps moving"
      );
    }
  }
  await checkpoint(label, pages, { samples });
  delete result.pauseInProgress;
}
async function group(mode, backend) {
  const room = await api("rooms", "POST", { isRecord: false, limit: 0 });
  rooms.set(mode + "/" + backend, { uuid: room.uuid });
  // Persist ownership before the next API/browser await. Abrupt shutdown or
  // power loss must not make these dedicated test rooms unidentifiable.
  await writeRoomJournal();
  const roomToken = await api("tokens/rooms/" + room.uuid, "POST", {
    role: "admin",
    lifespan: 7200000,
  });
  rooms.set(mode + "/" + backend, { uuid: room.uuid, roomToken });
  const pages = [];
  const openRole = async role => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(installNativeProbe);
    const page = await context.newPage();
    if (blockedAutoplay) await installPassiveEvaluation(context, page);
    page.on("pageerror", error => result.browserErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") {
        if (
          page.__volumeNetworkFault &&
          /(?:Failed to load resource:|net::ERR_INTERNET_DISCONNECTED|NetworkError|Network request failed|Failed to fetch|WebSocket.*(?:closed|failed|disconnected)|disconnected with code 4000)/i.test(
            message.text()
          )
        ) {
          result.expectedNetworkErrors ||= [];
          result.expectedNetworkErrors.push({ role, message: message.text().slice(0, 300) });
          return;
        }
        if (
          result.injectMediaFailure &&
          message.text().includes("[media-failure]") &&
          /(?:Video audio|Audio) load failed:/.test(message.text())
        ) {
          result.expectedMediaLoadErrors ||= [];
          result.expectedMediaLoadErrors.push({ mode, backend, role, message: message.text() });
          return;
        }
        result.consoleErrors ||= [];
        result.consoleErrors.push(message.text().slice(0, 300));
      }
    });
    page.on("console", message => {
      if (message.text().includes("[Slide]") || message.text().includes("[SlideDocsViewer]")) {
        result.setupLogs ||= [];
        result.setupLogs.push({ role, text: message.text().slice(0, 900) });
      }
    });
    page.on("requestfailed", request => {
      result.requestFailures ||= [];
      result.requestFailures.push({
        role,
        at: Date.now(),
        path: new URL(request.url()).pathname,
        error: request.failure()?.errorText,
        expectedNetworkFault: !!page.__volumeNetworkFault,
      });
    });
    page.on("response", response => {
      const pathname = new URL(response.url()).pathname;
      if (/\.mp[34]$/.test(pathname)) {
        const headers = response.headers();
        result.mediaResourceResponses ||= [];
        result.mediaResourceResponses.push({
          role,
          at: Date.now(),
          path: pathname,
          status: response.status(),
          range: response.request().headers().range,
          contentType: headers["content-type"],
          contentLength: headers["content-length"],
          contentRange: headers["content-range"],
        });
      }
    });
    page.on("requestfinished", request => {
      const pathname = new URL(request.url()).pathname;
      if (/\.mp[34]$/.test(pathname)) {
        result.mediaResourceTimings ||= [];
        result.mediaResourceTimings.push({ role, path: pathname, timing: request.timing() });
      }
    });
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) {
        result.navigations ||= [];
        result.navigations.push({
          mode,
          backend,
          role,
          path: new URL(frame.url()).pathname,
          at: Date.now(),
        });
      }
    });
    page.on("response", response => {
      const pathname = new URL(response.url()).pathname;
      if (response.status() >= 400 && !pathname.startsWith("/logstores/")) {
        result.resourceErrors ||= [];
        result.resourceErrors.push({
          path: pathname,
          status: response.status(),
          expected: pathname.startsWith("/fixture/retry.") && response.status() === 503,
        });
      }
    });
    await page.goto(origin + "/?mode=" + mode + "&backend=" + backend + "&role=" + role);
    try {
      await converged([page], 1);
    } catch (error) {
      result.setupFailure = await page.evaluate(() => ({
        state: window.appMediaGate?.sample(),
        dom: document.body.innerText.slice(0, 300),
      }));
      throw error;
    }
    pages.push(page);
    return page;
  };
  for (const role of ["writer-a", "writer-b", "reader"]) await openRole(role);
  const [a, b, r] = pages,
    prefix = mode + "/" + backend;
  if (mode === "1.5" && browserEngine === "chromium")
    assert.ok((await sample(a)).workerActive, "Use the real appliance worker");
  await checkpoint(prefix + "/setup", pages);
  if (blockedAutoplay) {
    const activation = await Promise.all(
      pages.map(p =>
        p.evaluate(() => ({
          active: navigator.userActivation.hasBeenActive,
          role: appMediaGate.sample().role,
        }))
      )
    );
    assert.ok(
      activation.every(s => !s.active),
      "Setup/evaluation must not grant autoplay activation"
    );
    result.activationChecks ||= [];
    result.activationChecks.push({ prefix, activation });
  }
  if (diagnostic && diagnostic !== "pause") {
    if (diagnostic === "volume")
      await volumeCoverage({
        prefix,
        pages,
        backend,
        sample,
        converged,
        playing,
        pauseCounts,
        stopped,
        checkpoint,
        result,
        openRole,
      });
    else if (diagnostic === "customer" || diagnostic === "animation")
      await documents(prefix, pages, backend, diagnostic === "animation");
    else
      await (diagnostic === "extended" ? extendedCoverage : boundaryCoverage)({
        prefix,
        pages,
        backend,
        sample,
        converged,
        playing,
        seekWhilePlaying,
        stopped,
        pauseCounts,
        checkpoint,
        result,
      });
    await Promise.all(
      pages.map(async p => {
        await p.evaluate(() => appMediaGate.close());
        await p.context().close();
      })
    );
    return;
  }
  for (const index of [1, 2]) {
    if ((await sample(a)).page !== index)
      await a.evaluate(index => appMediaGate.page(index), index);
    await converged(pages, index);
    const operations = ["play-pause", "repeat-pause", "seek-play-pause", "rapid-play-pause"];
    for (const name of diagnostic === "pause"
      ? Array.from({ length: 3 }, () => operations).flat()
      : operations) {
      if (diagnostic === "pause") {
        // Permission recovery can consume most of a 30s fixture; reset through
        // a real shared seek before each repeated operation.
        await a.evaluate(() => appMediaGate.seek(0));
        await Promise.all(
          pages.map(p =>
            p.waitForFunction(() => {
              const s = appMediaGate.sample();
              return (
                s.audioPaused &&
                s.audioTime < 0.1 &&
                s.storageMediaState?.type === "pause" &&
                s.storageMediaState.time === 0
              );
            })
          )
        );
      }
      const previousPauses = await pauseCounts(pages);
      await a.evaluate(() => appMediaGate.play());
      if (name !== "rapid-play-pause") await playing(pages, backend);
      if (name === "seek-play-pause") {
        await seekWhilePlaying(a, 5.4);
      }
      await a.evaluate(() => appMediaGate.pause());
      if (name === "repeat-pause") await a.evaluate(() => appMediaGate.pause());
      await stopped(
        prefix + "/" + (index === 1 ? "video" : "audio") + "/" + name,
        pages,
        backend,
        previousPauses
      );
    }
  }
  if (diagnostic === "pause") {
    await Promise.all(
      pages.map(async p => {
        await p.evaluate(() => appMediaGate.close());
        await p.context().close();
      })
    );
    return;
  }
  await lifecycle(prefix, pages);
  await extendedCoverage({
    prefix,
    pages,
    backend,
    sample,
    converged,
    playing,
    seekWhilePlaying,
    stopped,
    pauseCounts,
    checkpoint,
    result,
  });
  await boundaryCoverage({
    prefix,
    pages,
    backend,
    sample,
    converged,
    playing,
    seekWhilePlaying,
    stopped,
    pauseCounts,
    checkpoint,
    result,
  });
  for (const index of [1, 2]) {
    await a.evaluate(index => appMediaGate.page(index), index);
    await converged(pages, index);
    const previousPauses = await pauseCounts(pages);
    await a.evaluate(() => appMediaGate.play());
    await playing(pages, backend);
    await a.evaluate(() => appMediaGate.pause());
    await stopped(
      prefix + "/rejoin-" + (index === 1 ? "video" : "audio") + "-pause",
      pages,
      backend,
      previousPauses
    );
  }
  await documents(prefix, pages, backend);
  assert.equal((await sample(r)).stateWrites, 0);
  assert.equal((await sample(r)).sceneWrites, 0);
  await Promise.all(
    pages.map(async page => {
      await page.evaluate(() => appMediaGate.close());
      await page.context().close();
    })
  );
}

async function lifecycle(prefix, pages) {
  const [a, b, r] = pages;
  const receiveBefore = await Promise.all([b, r].map(sample));
  for (const page of [b, r]) await page.evaluate(() => appMediaGate.freeze());
  await a.evaluate(() => appMediaGate.page(1));
  await converged([a], 1);
  for (const page of [b, r])
    await page.evaluate(() => Promise.all([appMediaGate.unfreeze(), appMediaGate.unfreeze()]));
  await converged(pages, 1);
  await checkpoint(prefix + "/double-unfreeze", pages);
  for (const page of [b, r]) await page.evaluate(() => appMediaGate.freeze());
  await a.evaluate(() => appMediaGate.page(2));
  await converged([a], 2);
  for (const page of [b, r]) await page.evaluate(() => appMediaGate.freezeWhileRestoring());
  assert.ok((await sample(b)).frozen && (await sample(r)).frozen);
  await a.evaluate(() => appMediaGate.page(3));
  await converged([a], 3);
  for (const page of [b, r]) await page.evaluate(() => appMediaGate.unfreeze());
  await converged(pages, 3);
  await checkpoint(prefix + "/refreeze-during-restore", pages);
  for (const [i, page] of [b, r].entries()) {
    const s = await sample(page);
    assert.equal(s.stateWrites, receiveBefore[i].stateWrites);
    assert.equal(s.sceneWrites, receiveBefore[i].sceneWrites);
  }
  for (const page of [b, r]) {
    const before = await sample(page);
    await page.evaluate(() => appMediaGate.reconnect());
    await page.waitForFunction(epoch => appMediaGate.sample().epoch > epoch, before.epoch, {
      timeout: 90000,
    });
    await converged(pages, 3);
    await checkpoint(prefix + "/reconnect-" + before.role, pages);
  }
  const beforeAuthors = await Promise.all(pages.map(sample));
  await b.evaluate(() => appMediaGate.page(2));
  await converged(pages, 2);
  const afterB = await Promise.all(pages.map(sample));
  assert.ok(afterB[1].sceneWrites > beforeAuthors[1].sceneWrites);
  assert.equal(afterB[0].sceneWrites, beforeAuthors[0].sceneWrites);
  await a.evaluate(() => appMediaGate.page(3));
  await converged(pages, 3);
  await checkpoint(prefix + "/author-handoff", pages);
  await a.evaluate(() => appMediaGate.seedOld());
  await a.waitForTimeout(500);
  for (const page of pages) await page.reload();
  await converged(pages, 3);
  for (const page of pages)
    assert.ok((await sample(page)).storedSrc?.endsWith("/old/main.iife.js"));
  await checkpoint(prefix + "/historical-registration-rejoin", pages);
}
async function documents(prefix, pages, backend, animationOnly = false) {
  const [a] = pages;
  if (config.customerResource && !animationOnly) {
    await a.evaluate(
      doc => appMediaGate.selectDocument(doc.taskId, doc.prefix, "Customer media regression"),
      config.customerResource
    );
    await converged(pages, 1, 180000);
    const deckRows = await Promise.all(pages.map(sample));
    const actualPageCount = deckRows[0].slideCount;
    assert.ok(Number.isInteger(actualPageCount) && actualPageCount > 0);
    assert.ok(
      deckRows.every(s => s.slideCount === actualPageCount),
      "All clients need the same deck metadata"
    );
    assert.equal(
      config.customerResource.pageCount,
      actualPageCount,
      "Configured customer pages must match the actual deck"
    );
    const deckCoverage = {
      prefix,
      actualPageCount,
      expectedPageCount: config.customerResource.pageCount,
      pages: [1],
    };
    result.customerDeckChecks ||= [];
    result.customerDeckChecks.push(deckCoverage);
    const previousPauses = await pauseCounts(pages);
    await a.evaluate(() => appMediaGate.play());
    await playing(pages, backend);
    await a.evaluate(() => appMediaGate.pause());
    await stopped(prefix + "/customer-video-pause", pages, backend, previousPauses);
    await a.evaluate(() => appMediaGate.play());
    await playing(pages, backend);
    const passiveBefore = await Promise.all(pages.slice(1).map(sample));
    await Promise.all(pages.slice(1).map(p => p.evaluate(() => appMediaGate.freeze())));
    await Promise.all(
      pages.slice(1).map(p =>
        p.waitForFunction(
          () => {
            const s = appMediaGate.sample();
            return (
              s.frozen &&
              !s.playerExists &&
              s.native.activeRetiredNodes === 0 &&
              s.native.activeSources === 0
            );
          },
          null,
          { timeout: 15000 }
        )
      )
    );
    await Promise.all(pages.slice(1).map(p => p.evaluate(() => appMediaGate.unfreeze())));
    await converged(pages, 1);
    const leader = await sample(a);
    const shouldPlay =
      leader.storageMediaState?.type === "play" &&
      (leader.now - leader.storageMediaState.time) / 1000 < leader.clippedDuration;
    if (shouldPlay) await playing(pages, backend);
    else
      await Promise.all(
        pages.map(p =>
          p.waitForFunction(
            () => !appMediaGate.sample().isPlaying && appMediaGate.sample().audioPaused
          )
        )
      );
    const passiveAfter = await Promise.all(pages.slice(1).map(sample));
    passiveAfter.forEach((s, i) => {
      assert.equal(s.stateWrites, passiveBefore[i].stateWrites);
      assert.equal(s.sceneWrites, passiveBefore[i].sceneWrites);
      assert.equal(s.native.activeRetiredNodes, 0);
      assert.equal(s.native.activeRetiredSources, 0);
    });
    await checkpoint(prefix + "/customer-video-frozen-release", pages, { shouldPlay });
    if (shouldPlay) {
      const counts = await pauseCounts(pages);
      await a.evaluate(() => appMediaGate.pause());
      await stopped(prefix + "/customer-video-release-pause", pages, backend, counts);
    }
    for (let index = 2; index <= actualPageCount; index++) {
      await a.evaluate(index => appMediaGate.page(index), index);
      await converged(pages, index, 180000);
      await checkpoint(prefix + "/customer-page-" + index, pages);
      deckCoverage.pages.push(index);
    }
    await a.screenshot({ path: path.join(output, prefix.replace("/", "-") + "-customer.png") });
  } else if (!animationOnly)
    result.notRun.push(prefix + "/customer-deck: no customerResource configured");
  if (config.animationResource) {
    if (
      animationOnly ||
      config.animationResource.taskId !== config.customerResource?.taskId ||
      config.animationResource.prefix !== config.customerResource?.prefix
    ) {
      await a.evaluate(
        doc => appMediaGate.selectDocument(doc.taskId, doc.prefix, "Animation regression"),
        config.animationResource
      );
      await converged(pages, 1);
    }
    await a.evaluate(index => appMediaGate.page(index), config.animationResource.page || 2);
    await converged(pages, config.animationResource.page || 2);
    const steps = [];
    for (let click = 0; click < 2; click++) {
      await Promise.all(
        pages.map(page =>
          page.waitForFunction(
            () => {
              const s = appMediaGate.sample();
              return (
                (s.mainSeqState === "idle" || s.mainSeqState === "end") &&
                s.mainSeqState === s.storageMainSeqState &&
                s.mainSeqStep === s.storageMainSeqStep
              );
            },
            null,
            { timeout: 15000 }
          )
        )
      );
      const before = await Promise.all(pages.map(sample));
      assert.ok(
        before.every(s => s.hasNextAnimation && s.mainSeqLength >= 2),
        "Animation fixture needs at least two real click steps"
      );
      assert.ok(before.every(s => s.mainSeqState === "idle" || s.mainSeqState === "end"));
      assert.ok(
        before.every(
          s => s.mainSeqStep === before[0].mainSeqStep && s.mainSeqState === before[0].mainSeqState
        )
      );
      const expected = before[0].mainSeqStep + (before[0].mainSeqState === "idle" ? 0 : 1);
      const pixelsBefore = await Promise.all(
        pages.map(p => p.evaluate(() => appMediaGate.frame()))
      );
      await a.evaluate(() => appMediaGate.nextStep());
      await Promise.all(
        pages.map((page, i) =>
          page.waitForFunction(
            ({ expected, count, events }) => {
              const s = appMediaGate.sample();
              const currentEvents = s.animationEvents.slice(events);
              return (
                s.nextStepCount > count &&
                s.mainSeqStep === expected &&
                s.storageMainSeqStep === expected &&
                s.mainSeqState === "end" &&
                s.storageMainSeqState === "end" &&
                currentEvents.some(e => e.type === "mainSeqStepStart" && e.index === expected) &&
                currentEvents.some(e => e.type === "mainSeqStepEnd" && e.index === expected)
              );
            },
            { expected, count: before[i].nextStepCount, events: before[i].animationEvents.length },
            { timeout: 15000 }
          )
        )
      );
      const after = await Promise.all(pages.map(sample));
      const pixelsAfter = await Promise.all(pages.map(p => p.evaluate(() => appMediaGate.frame())));
      for (let i = 0; i < pages.length; i++) {
        assert.ok(pixelsBefore[i].bytes > 0 && pixelsAfter[i].bytes > 0);
        assert.notEqual(
          pixelsBefore[i].hash,
          pixelsAfter[i].hash,
          "The real rendered animation must change pixels"
        );
      }
      steps.push({ expected, before, after, pixelsBefore, pixelsAfter });
    }
    await checkpoint(prefix + "/animation-step", pages, { steps });
  } else result.notRun.push(prefix + "/animation: no animationResource configured");
}
async function writeRoomJournal() {
  const filename = path.join(output, "owned-rooms.json");
  const journal = {
    startedAt: result.startedAt,
    rooms: [...rooms.entries()].map(([cohort, room]) => ({
      cohort,
      uuid: room.uuid,
      isRecord: false,
    })),
    cleanup: result.cleanup,
  };
  await fs.writeFile(filename + ".tmp", JSON.stringify(journal, null, 2) + "\n");
  await fs.rename(filename + ".tmp", filename);
}

try {
  assert.ok(
    process.env.APP_SLIDE_E2E_CONFIG,
    "Set APP_SLIDE_E2E_CONFIG to an external private config.json"
  );
  config = JSON.parse(await fs.readFile(process.env.APP_SLIDE_E2E_CONFIG, "utf8"));
  if (!diagnostic) {
    assert.ok(
      config.customerResource && config.animationResource,
      "Full acceptance requires customer and animation resources"
    );
  }
  if (config.customerResource) {
    assert.ok(
      Number.isInteger(config.customerResource.pageCount) && config.customerResource.pageCount > 0,
      "Customer pageCount must be a positive integer before creating any room"
    );
  }
  assert.ok(["enabled", "disabled", "default"].includes(result.sharedMediaVolumeMode));
  if (diagnostic)
    assert.ok(["1.0", "1.5"].includes(diagnosticMode), "Known diagnostic whiteboard mode");
  result.harnessSHA256 = crypto
    .createHash("sha256")
    .update(
      Buffer.concat(
        await Promise.all(
          [
            "run.mjs",
            "coverage.mjs",
            "boundaries.mjs",
            "main.ts",
            "media-diagnostics.ts",
            "acceptance.mjs",
            "native-probe.mjs",
            "passive-page.mjs",
            "volume.mjs",
            "volume-disabled.mjs",
          ].map(file => fs.readFile(path.join(root, file)))
        )
      )
    )
    .digest("hex");
  assert.ok(
    config.sdkToken && config.appIdentifier && config.oldIifePath,
    "APP_SLIDE_E2E_CONFIG requires private test credentials and previous IIFE"
  );
  if (!process.env.SLIDE_CANDIDATE_DIR) {
    assert.equal(
      slidePkg.version,
      pkg.devDependencies["@netless/slide"],
      "Installed npm Slide must match the app's exact dependency pin"
    );
  }
  // Bind the reported Slide input to the app actually served to the browser.
  // A prior candidate build must not survive a later installed-npm test run.
  const built = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
    cwd: path.resolve(root, "../.."),
    stdio: "inherit",
    env: process.env,
  });
  assert.ifError(built.error);
  assert.equal(built.signal, null, "App build must finish normally before E2E");
  assert.equal(built.status, 0, "Build the selected Slide input before E2E");
  result.appRebuilt = true;
  result.slideSHA256 = crypto
    .createHash("sha256")
    .update(await fs.readFile(slideEntry))
    .digest("hex");
  result.appSHA256 = crypto
    .createHash("sha256")
    .update(await fs.readFile(path.join(appDist, "main.es.js")))
    .digest("hex");
  await start();
  assert.ok(["chromium", "webkit"].includes(browserEngine), "Supported real browser engine");
  browser = await engines[browserEngine].launch({
    ...(browserEngine !== "chromium"
      ? {}
      : process.env.SLIDE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.SLIDE_CHROMIUM_EXECUTABLE }
      : { channel: "chrome" }),
    headless: true,
    args:
      browserEngine !== "chromium"
        ? []
        : [
            "--autoplay-policy=" +
              (blockedAutoplay ? "document-user-activation-required" : "no-user-gesture-required"),
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
          ],
  });
  result.browser = browser.version();
  await verifyNativeAudioEnvironment();
  assert.ok(
    !diagnostic ||
      ["boundaries", "customer", "animation", "pause", "extended", "volume"].includes(diagnostic),
    "Known diagnostic phase"
  );
  for (const mode of diagnostic ? [diagnosticMode] : ["1.0", "1.5"])
    for (const backend of diagnostic ? [diagnosticBackend] : ["html5", "webaudio"])
      await group(mode, backend);
  assert.deepEqual(result.browserErrors, []);
  assert.deepEqual(result.notRun, []);
  if (blockedAutoplay && diagnostic === "volume") {
    const roles = new Set((result.permissionChecks || []).map(c => c.role));
    for (const role of ["writer-a", "writer-b", "reader"])
      assert.ok(roles.has(role), "Blocked volume suite must recover " + role);
  }
  if (blockedAutoplay && diagnostic !== "volume") {
    assert.equal(result.activationChecks.length, diagnostic ? 1 : 4);
    assert.equal(
      new Set((result.permissionChecks || []).map(c => c.role)).size,
      3,
      "All roles must recover genuinely blocked autoplay"
    );
    for (const mode of diagnostic ? [diagnosticMode] : ["1.0", "1.5"])
      for (const backend of diagnostic ? [diagnosticBackend] : ["html5", "webaudio"]) {
        assert.equal(
          new Set(
            result.permissionChecks
              .filter(
                c =>
                  c.mode === mode &&
                  c.backend === backend &&
                  c.gestures > 0 &&
                  (backend !== "html5" || c.requests > 0)
              )
              .map(c => c.role)
          ).size,
          3,
          mode + "/" + backend + " must recover all three genuinely blocked clients"
        );
        if (!diagnostic || diagnostic === "pause") {
          const first = result.cases.find(
            c => c.label === mode + "/" + backend + "/video/play-pause"
          );
          assert.equal(first?.rows.length, 3);
          assert.ok(
            first.rows.every(
              s =>
                s.permissionGestures > 0 &&
                (backend === "html5" ? s.permissionRequests > 0 : s.audioContextState === "running")
            ),
            "Every client must recover in the first playback case, before later pointer actions"
          );
          if (backend === "webaudio") {
            const setup = result.cases.find(c => c.label === mode + "/" + backend + "/setup");
            assert.ok(
              setup.rows.every(s => s.audioContextState === "suspended"),
              "Actual AudioContexts must start suspended"
            );
          }
        }
      }
  }
  assert.deepEqual(
    (result.resourceErrors || []).filter(e => !e.expected),
    [],
    "Unexpected resource HTTP failures"
  );
  assert.deepEqual(
    (result.requestFailures || []).filter(
      f =>
        !f.expectedNetworkFault &&
        f.error !== "net::ERR_ABORTED" &&
        // WebKit uses this spelling when freeze/page change unloads native media.
        !(browserEngine === "webkit" && f.error === "cancelled" && /\.mp[34]$/.test(f.path)) &&
        !f.path.startsWith("/logstores/")
    ),
    [],
    "Resource transport failures"
  );
  assert.deepEqual(
    (result.consoleErrors || []).filter(
      message =>
        !isGraphicsContextNotice(message) &&
        !message.includes("agora-foundation logger worker unavailable, fallback to Argus") &&
        // Reproduced during real 1.5 reconnects with npm app-slide 0.2.107;
        // WindowManager/Appliance keeps the React root while recreating its view.
        !message.startsWith(
          "Warning: render(...): Replacing React-rendered children with a new root component."
        ) &&
        !message.includes('disconnected with code 4000 "app-slide E2E transport interruption"') &&
        !(message.startsWith("Failed to load resource:") && /\b503\b/.test(message))
    ),
    [],
    "Unexpected console errors"
  );
  result.passed = true;
  result.matrixComplete = !diagnostic;
} catch (error) {
  result.passed = false;
  result.error = error.message;
  if (browser)
    result.failureSnapshots = await Promise.all(
      browser
        .contexts()
        .flatMap(c => c.pages())
        .map(p => p.evaluate(() => window.appMediaGate?.sample()).catch(() => null))
    );
  if (browser)
    result.executionTraces = await Promise.all(
      browser
        .contexts()
        .flatMap(c => c.pages())
        .map(p =>
          p
            .evaluate(() => ({
              role: window.appMediaGate?.sample()?.role,
              events: window.appMediaGate?.executionTrace?.(),
            }))
            .catch(() => ({ unavailable: true }))
        )
    );
  console.error(error.message);
  process.exitCode = 1;
} finally {
  result.graphicsContextNotices = (result.consoleErrors || []).filter(isGraphicsContextNotice);
  if (browser) await browser.close();
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  for (const [cohort, room] of rooms) {
    try {
      const before = await api("rooms/" + room.uuid);
      assert.equal(before.uuid, room.uuid);
      assert.equal(before.isRecord, false);
      await api("rooms/" + room.uuid, "PATCH", { isBan: true });
      const after = await api("rooms/" + room.uuid);
      assert.equal(after.isBan, true);
      assert.equal(after.isRecord, false);
      result.cleanup.push({ cohort, uuid: room.uuid, isBan: true, isRecord: false });
    } catch (error) {
      result.passed = false;
      result.cleanup.push({ cohort, uuid: room.uuid, failed: true, error: error.message });
      process.exitCode = 1;
    }
    try {
      await writeRoomJournal();
    } catch (error) {
      result.passed = false;
      result.journalErrors ||= [];
      result.journalErrors.push({ cohort, error: error.message });
      process.exitCode = 1;
    }
  }
  result.finishedAt = new Date().toISOString();
  result.status = result.passed ? "passed" : "failed";
  await saveResult();
  console.log(
    JSON.stringify({
      passed: result.passed,
      cases: result.cases.length,
      cleanup: result.cleanup,
      output,
    })
  );
}
