import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(root, "../../../..");
const require = createRequire(path.join(project, "package.json"));
const { createServer } = require("vite");
const { chromium } = process.env.APP_SLIDE_PLAYWRIGHT
  ? createRequire(import.meta.url)(process.env.APP_SLIDE_PLAYWRIGHT)
  : require("playwright");
const output = path.resolve(
  process.env.APP_SLIDE_E2E_OUTPUT || path.join(root, ".results", String(Date.now()))
);
let config;
const pkg = JSON.parse(
  await fs.readFile(path.join(project, "packages/app-slide/package.json"), "utf8")
);
const leaf = createRequire(path.join(project, "packages/app-slide/package.json"));
const slideEntry = leaf.resolve("@netless/slide");
const slidePkg = JSON.parse(
  await fs.readFile(path.join(path.dirname(slideEntry), "../package.json"), "utf8")
);
const result = {
  startedAt: new Date().toISOString(),
  appVersion: pkg.version,
  slideVersion: slidePkg.version,
  versions: Object.fromEntries(
    ["white-web-sdk", "@netless/window-manager", "@netless/appliance-plugin"].map(name => [
      name,
      leaf(name + "/package.json").version,
    ])
  ),
  cases: [],
  cleanup: [],
  browserErrors: [],
  notRun: [],
};
const rooms = new Map(),
  runId = "app-media-" + Date.now();
let vite, server, browser, origin;
const appDist = path.join(project, "packages/app-slide/dist");

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
function fixture(index) {
  const type = index === 1 ? "video" : "audio";
  return {
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
}
async function start() {
  await fs.mkdir(output, { recursive: true });
  server = http.createServer();
  vite = await createServer({
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
    server: { middlewareMode: true, hmr: false, fs: { allow: [project, appDist] } },
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
        return res.end(
          await vite.transformIndexHtml(
            "/",
            await fs.readFile(path.join(root, "index.html"), "utf8")
          )
        );
      }
      if (url.pathname === "/__config") {
        const room = rooms.get(
          url.searchParams.get("mode") + "/" + url.searchParams.get("backend")
        );
        res.setHeader("Content-Type", "application/json");
        return res.end(
          JSON.stringify({
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
      if (url.pathname.startsWith("/fixture/") && index) {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify(fixture(Number(index))));
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
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1z8AAAAASUVORK5CYII=",
            "base64"
          )
        );
      }
      if (["/fixture/media.mp4", "/fixture/media.mp3"].includes(url.pathname)) {
        const data = await fs.readFile(path.join(root, "fixtures", path.basename(url.pathname)));
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
      vite.middlewares(req, res);
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
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(result, null, 2) + "\n");
  console.log("PASS " + label);
  return rows;
}
async function playing(pages, backend) {
  await Promise.all(
    pages.map(page =>
      page.waitForFunction(
        backend => {
          const s = appMediaGate.sample();
          return (
            s.backend === backend &&
            s.isPlaying &&
            s.audioPaused === false &&
            (s.mediaType !== "video" || s.videoPaused === false) &&
            s.engineMediaState?.type === "play" &&
            s.storageMediaState?.type === "play"
          );
        },
        backend,
        { timeout: 120000 }
      )
    )
  );
  const before = await Promise.all(pages.map(sample));
  try {
    await Promise.all(
      pages.map((page, i) =>
        page.waitForFunction(
          before => {
            const s = appMediaGate.sample();
            return (
              s.audioTime > before.audioTime + 0.1 &&
              (s.mediaType !== "video" || s.videoTime > before.videoTime + 0.1)
            );
          },
          before[i],
          { timeout: 15000 }
        )
      )
    );
  } catch (error) {
    result.playFailure = { before, after: await Promise.all(pages.map(sample)) };
    throw error;
  }
}
async function pauseCounts(pages) {
  return Promise.all(
    pages.map(
      async page => (await sample(page)).signals.filter(e => e.type === "mediaPause").length
    )
  );
}
async function stopped(label, pages, backend, previousPauses) {
  await Promise.all(
    pages.map((page, i) =>
      page.waitForFunction(
        count => {
          const s = appMediaGate.sample();
          return (
            s.signals.filter(e => e.type === "mediaPause").length > count &&
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
  result.pauseInProgress = { label, samples };
  for (let n = 0; n < 4; n++) {
    const rows = await Promise.all(pages.map(sample));
    samples.push(rows);
    for (const s of rows) {
      assert.equal(s.backend, backend, label + " requested real backend");
      assert.equal(s.audioPaused, true, label + " audio must stop");
      if (backend === "html5") assert.equal(s.audioNodePaused, true);
      else assert.equal(s.webAudioSourceActive, false);
      if (s.mediaType === "video") assert.equal(s.videoPaused, true);
      assert.equal(s.engineMediaState.type, "pause");
      assert.equal(s.storageMediaState.type, "pause");
      assert.ok(Math.abs(s.engineMediaState.time - s.storageMediaState.time) < 0.001);
      assert.ok(Math.abs(s.audioTime - Math.floor(s.storageMediaState.time)) < 0.2);
      assert.ok(s.signals.some(event => event.type === "mediaPause" && event.id === s.mediaId));
    }
    if (n < 3) await pages[0].waitForTimeout(300);
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
  const roomToken = await api("tokens/rooms/" + room.uuid, "POST", {
    role: "admin",
    lifespan: 7200000,
  });
  rooms.set(mode + "/" + backend, { uuid: room.uuid, roomToken });
  const pages = [];
  for (const role of ["writer-a", "writer-b", "reader"]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on("pageerror", error => result.browserErrors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") {
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
        path: new URL(request.url()).pathname,
        error: request.failure()?.errorText,
      });
    });
    page.on("response", response => {
      const pathname = new URL(response.url()).pathname;
      if (response.status() >= 400 && !pathname.startsWith("/logstores/")) {
        result.resourceErrors ||= [];
        result.resourceErrors.push({ path: pathname, status: response.status() });
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
  }
  const [a, b, r] = pages,
    prefix = mode + "/" + backend;
  if (mode === "1.5") assert.ok((await sample(a)).workerActive, "Use the real appliance worker");
  await checkpoint(prefix + "/setup", pages);
  for (const index of [1, 2]) {
    if ((await sample(a)).page !== index)
      await a.evaluate(index => appMediaGate.page(index), index);
    await converged(pages, index);
    for (const name of ["play-pause", "repeat-pause", "seek-play-pause", "rapid-play-pause"]) {
      const previousPauses = await pauseCounts(pages);
      await a.evaluate(() => appMediaGate.play());
      if (name !== "rapid-play-pause") await playing(pages, backend);
      if (name === "seek-play-pause") {
        await a.evaluate(() => appMediaGate.seek(5.4));
        await a.waitForTimeout(400);
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
  await lifecycle(prefix, pages);
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
async function documents(prefix, pages, backend) {
  const [a] = pages;
  if (config.customerResource) {
    await a.evaluate(
      doc => appMediaGate.selectDocument(doc.taskId, doc.prefix, "Customer media regression"),
      config.customerResource
    );
    await converged(pages, 1, 180000);
    const previousPauses = await pauseCounts(pages);
    await a.evaluate(() => appMediaGate.play());
    await playing(pages, backend);
    await a.evaluate(() => appMediaGate.pause());
    await stopped(prefix + "/customer-video-pause", pages, backend, previousPauses);
    for (let index = 2; index <= config.customerResource.pageCount; index++) {
      await a.evaluate(index => appMediaGate.page(index), index);
      await converged(pages, index, 180000);
      await checkpoint(prefix + "/customer-page-" + index, pages);
    }
    await a.screenshot({ path: path.join(output, prefix.replace("/", "-") + "-customer.png") });
  } else result.notRun.push(prefix + "/customer-deck: no customerResource configured");
  if (config.animationResource) {
    if (
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
    const animationBefore = await sample(a);
    assert.ok(animationBefore.hasNextAnimation, "Animation fixture needs a remaining click step");
    const before = animationBefore.mainSeqStep;
    await a.evaluate(() => appMediaGate.nextStep());
    await a.waitForFunction(step => appMediaGate.sample().mainSeqStep > step, before, {
      timeout: 15000,
    });
    await Promise.all(
      pages.map(page =>
        page.waitForFunction(
          step => {
            const s = appMediaGate.sample();
            return s.mainSeqStep > step && s.storageMainSeqStep === s.mainSeqStep;
          },
          before,
          { timeout: 15000 }
        )
      )
    );
    const rows = await Promise.all(pages.map(sample));
    assert.ok(rows.every(s => s.mainSeqStep === rows[0].mainSeqStep));
    await checkpoint(prefix + "/animation-step", pages);
  } else result.notRun.push(prefix + "/animation: no animationResource configured");
}
try {
  assert.ok(
    process.env.APP_SLIDE_E2E_CONFIG,
    "Set APP_SLIDE_E2E_CONFIG to an external private config.json"
  );
  config = JSON.parse(await fs.readFile(process.env.APP_SLIDE_E2E_CONFIG, "utf8"));
  assert.ok(
    config.sdkToken && config.appIdentifier && config.oldIifePath,
    "APP_SLIDE_E2E_CONFIG requires private test credentials and previous IIFE"
  );
  result.slideSHA256 = crypto
    .createHash("sha256")
    .update(await fs.readFile(slideEntry))
    .digest("hex");
  result.appSHA256 = crypto
    .createHash("sha256")
    .update(await fs.readFile(path.join(appDist, "main.es.js")))
    .digest("hex");
  await start();
  browser = await chromium.launch({
    ...(process.env.SLIDE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.SLIDE_CHROMIUM_EXECUTABLE }
      : { channel: "chrome" }),
    headless: true,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
  result.browser = browser.version();
  for (const mode of ["1.0", "1.5"])
    for (const backend of ["html5", "webaudio"]) await group(mode, backend);
  assert.deepEqual(result.browserErrors, []);
  assert.deepEqual(result.notRun, []);
  assert.deepEqual(result.resourceErrors || [], [], "Resource HTTP failures");
  assert.deepEqual(
    (result.requestFailures || []).filter(
      f => f.error !== "net::ERR_ABORTED" && !f.path.startsWith("/logstores/")
    ),
    [],
    "Resource transport failures"
  );
  assert.deepEqual(
    (result.consoleErrors || []).filter(
      message =>
        !message.includes("agora-foundation logger worker unavailable, fallback to Argus") &&
        !message.includes('disconnected with code 4000 "app-slide E2E transport interruption"') &&
        !message.startsWith("Failed to load resource:")
    ),
    [],
    "Unexpected console errors"
  );
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
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
  }
  result.finishedAt = new Date().toISOString();
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "results.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify({
      passed: result.passed,
      cases: result.cases.length,
      cleanup: result.cleanup,
      output,
    })
  );
}
