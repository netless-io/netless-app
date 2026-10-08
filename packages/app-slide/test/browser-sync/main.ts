import { WhiteWebSdk } from "white-web-sdk";
import { WindowManager } from "@netless/window-manager";
import "@netless/window-manager/dist/style.css";
import { ApplianceMultiPlugin } from "@netless/appliance-plugin";
import "@netless/appliance-plugin/dist/style.css";
import fullWorkerUrl from "@netless/appliance-plugin/dist/fullWorker.js?url";
import subWorkerUrl from "@netless/appliance-plugin/dist/subWorker.js?url";
// Use the exact app-slide build, which bundles the registry Slide engine.
import SlideApp from "../../dist/main.es.js";

const query = new URLSearchParams(location.search);
const mode = query.get("mode") === "1.5" ? "1.5" : "1.0";
const role = query.get("role") || "writer-a";
if (!["writer-a", "writer-b", "reader-1", "reader-2"].includes(role))
  throw new Error("Invalid role");
const writable = role.startsWith("writer");
const delay = role === "writer-b" ? 1500 : 0;
const events: Record<string, unknown>[] = [];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let room: any, manager: any, appId: string | undefined, lastSlide: any;
let poll: ReturnType<typeof setInterval>;
const stats: any = {
  mode,
  role,
  writable,
  renders: [],
  sceneWrites: [],
  stateWrites: [],
  localWrites: [],
};

function record(kind: string, value: Record<string, unknown>) {
  const event = { at: Date.now(), mode, role, kind, ...value };
  events.push(event);
  void fetch("/__sync/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => {
    // Keep the rendered page observable if the evidence endpoint is unavailable.
  });
}
function observeContext(ctx: any) {
  if (ctx.__syncObserved) return;
  ctx.__syncObserved = true;
  const setScene = ctx.setScenePath.bind(ctx);
  ctx.setScenePath = async (path: string) => {
    stats.sceneWrites.push(path);
    record("shared-scene", { page: path.split("/").pop(), appId: ctx.appId });
    return setScene(path);
  };
  const setState = ctx.storage.setState.bind(ctx.storage);
  ctx.storage.setState = (value: any) => {
    if (value.state) {
      stats.stateWrites.push(value.state.currentSlideIndex);
      record("shared-state", { page: value.state.currentSlideIndex, appId: ctx.appId });
    }
    return setState(value);
  };
}
function result() {
  return appId ? manager.queryOne(appId)?.appResult : undefined;
}
async function waitReady() {
  for (let i = 0; i < 600; i++) {
    if (result()?.controller()?.ready) return;
    await sleep(100);
  }
  throw new Error("Controller readiness timed out");
}

async function start() {
  const response = await fetch(`/__sync/config?mode=${mode}`);
  if (!response.ok) throw new Error("需要先提供隔离测试房间配置，见 test/browser-sync/README.md");
  const config = await response.json();
  const sdk = new WhiteWebSdk({ appIdentifier: config.appIdentifier, region: config.region });
  const quiet = () => {
    // Observe explicit events below without logging room connection details.
  };
  const logger = { info: quiet, warn: quiet, error: quiet };
  WindowManager.register({
    kind: "Slide",
    src: {
      ...SlideApp,
      setup(context: any) {
        // Observe initialization writes too, before the real app starts setup.
        observeContext(context);
        return SlideApp.setup(context);
      },
    },
    appOptions: {
      useLocalCache: false,
      logger,
      loaderDelegate: {
        async loadJson(url: string) {
          if (delay) await sleep(delay);
          const r = await fetch(url);
          if (!r.ok) throw new Error(`resource HTTP ${r.status}`);
          return r.text();
        },
        async loadImage(url: string) {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`resource HTTP ${r.status}`);
          return r.blob();
        },
        redirectMedia: (url: string) => url,
      },
    },
  });
  room = await sdk.joinRoom({
    uuid: config.uuid,
    roomToken: config.roomToken,
    uid: `${config.runId}-${role}`,
    isWritable: writable,
    useMultiViews: true,
    invisiblePlugins: mode === "1.5" ? [WindowManager, ApplianceMultiPlugin] : [WindowManager],
    disableMagixEventDispatchLimit: true,
  });
  manager = await WindowManager.mount({
    room,
    container: document.querySelector("#board"),
    chessboard: false,
    cursor: false,
    supportAppliancePlugin: mode === "1.5",
  });
  if (mode === "1.5") {
    const plugin = await ApplianceMultiPlugin.getInstance(manager, {
      options: {
        cdn: { fullWorkerUrl, subWorkerUrl },
        extras: { useWorker: "mainThread" },
      },
    });
    const localSwitch = plugin.setViewLocalScenePathChange.bind(plugin);
    plugin.setViewLocalScenePathChange = async (path: string, id: string) => {
      stats.localWrites.push(path);
      record("local-scene", { page: path.split("/").pop(), appId: id });
      await localSwitch(path, id);
    };
  }
  const attach = (id: string) => {
    if (manager.queryOne(id)?.kind !== "Slide") return;
    appId = id;
    const proxy = manager.queryOne(id);
    if (proxy.appContext) observeContext(proxy.appContext);
  };
  manager.emitter.on("onAppSetup", attach);
  poll = setInterval(() => {
    Object.keys(manager.apps || {}).forEach(attach);
    const slide = result()?.slide();
    if (slide && slide !== lastSlide) {
      lastSlide = slide;
      slide.on("renderEnd", (page: number, origin: any) => {
        stats.renders.push(page);
        record("render-end", { page, origin });
      });
      slide.on("syncDispatch", (event: any) =>
        record("dispatch", {
          type: event.type,
          clientId: event.clientId,
          page: event.index,
        })
      );
    }
    const proxy = appId && manager.queryOne(appId);
    Object.assign(stats, {
      phase: room.phase,
      observerId: room.observerId,
      page: slide?.slideState.currentSlideIndex,
      storagePage: proxy?.appContext?.storage.state.state?.currentSlideIndex,
      scene: proxy?.view?.focusScenePath,
      pluginScene:
        manager._appliancePlugin?.currentManager?.viewContainerManager.getView(appId)
          ?.focusScenePath,
    });
    document.querySelector("#status")!.textContent = JSON.stringify(stats, null, 2);
    (document.querySelector("#run") as HTMLButtonElement).disabled =
      role !== "writer-a" || !result()?.controller()?.ready;
    (document.querySelector("#restore") as HTMLButtonElement).disabled =
      !result()?.controller()?.ready;
  }, 100);
  if (role === "writer-a") {
    await sleep(1000);
    appId = await manager.addApp({
      kind: "Slide",
      options: {
        scenePath: `/sync-origin-${config.runId}`,
        title: `Sync origin ${mode}`,
      },
      attributes: { taskId: config.taskId, url: config.prefix },
    });
    attach(appId!);
  }
  document.querySelector("#title")!.textContent = `白板 ${mode} / ${role}`;
  record("joined", { observerId: room.observerId });
}

async function navigate() {
  await waitReady();
  const count = result().controller().pageCount;
  for (const page of [2, 3, Math.min(count, 6), 2, 1]) {
    result().jumpToPage(page);
    await waitReady();
    const deadline = Date.now() + 60_000;
    while (result()?.slide()?.slideState.currentSlideIndex !== page) {
      if (Date.now() >= deadline) throw new Error(`Page ${page} render timed out`);
      await sleep(100);
    }
    await sleep(100);
  }
  record("navigation-complete", {});
}
async function restore() {
  const controller = result()?.controller();
  if (!controller) return;
  await controller.freeze();
  await sleep(1000);
  await controller.unfreeze();
  record("restored", { page: result()?.slide()?.slideState.currentSlideIndex });
}
function showError(error: Error) {
  stats.error = error.message;
  document.querySelector("#status")!.textContent = error.message;
}
document.querySelector("#run")!.addEventListener("click", () => void navigate().catch(showError));
document
  .querySelector("#restore")!
  .addEventListener("click", () => void restore().catch(showError));
async function exit() {
  clearInterval(poll);
  if (room) await room.disconnect();
}
document.querySelector("#exit")!.addEventListener("click", exit);
window.addEventListener("pagehide", () => {
  void exit();
});
(window as any).__syncOriginTest = { stats, events, result, navigate, restore, exit };
start().catch(showError);
