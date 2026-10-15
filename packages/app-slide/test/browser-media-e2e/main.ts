import { WhiteWebSdk } from "white-web-sdk";
import { WindowManager } from "@netless/window-manager";
import "@netless/window-manager/dist/style.css";
import { ApplianceMultiPlugin } from "@netless/appliance-plugin";
import "@netless/appliance-plugin/dist/style.css";
import fullWorkerUrl from "@netless/appliance-plugin/dist/fullWorker.js?url";
import subWorkerUrl from "@netless/appliance-plugin/dist/subWorker.js?url";

const query = new URLSearchParams(location.search);
const mode = query.get("mode") || "1.0";
const backend = query.get("backend") || "html5";
const role = query.get("role") || "reader";
const slow = role === "writer-b";
const registration = role === "writer-a" ? "esm" : "iife";
const config = await (await fetch("/__config?" + query)).json();
const appBundleUrl = "/app/main.es.js";
const bundle = registration === "esm" ? await import(/* @vite-ignore */ appBundleUrl) : undefined;
const errors: string[] = [];
const signals: { type: string; id?: string; authorId?: number }[] = [];
let appId: string, observedController: any, observedProxy: any;
let sceneWrites = 0,
  stateWrites = 0,
  epoch = 0,
  activeRestores = 0,
  maxRestores = 0;
const sockets = new Set<WebSocket>();
const originalSend = WebSocket.prototype.send;
WebSocket.prototype.send = function (data) {
  sockets.add(this);
  return originalSend.call(this, data);
};
addEventListener("error", event => errors.push(event.message || "window error"));
addEventListener("unhandledrejection", () => errors.push("unhandled rejection"));

function app() {
  if (!appId) appId = Object.keys(manager?.apps || {})[0];
  return appId && manager?.queryOne(appId);
}
function engine() {
  return app()?.appResult?.slide();
}
function media() {
  return Object.values(engine()?.player?.currentStage?.ctx?.medias || {})[0] as any;
}
function observe() {
  const proxy = app(),
    controller = proxy?.appResult?.controller();
  if (proxy && proxy !== observedProxy) {
    epoch++;
    observedProxy = proxy;
  }
  if (!controller || controller === observedController) return;
  observedController = controller;
  const context = controller.context;
  const setScene = context.setScenePath.bind(context);
  context.setScenePath = (...args: any[]) => {
    sceneWrites++;
    return setScene(...args);
  };
  const setState = context.storage.setState.bind(context.storage);
  context.storage.setState = (...args: any[]) => {
    if (args[0]?.state) stateWrites++;
    return setState(...args);
  };
  const slide = controller.slide;
  const restore = slide.setSlideState.bind(slide);
  slide.setSlideState = async (...args: any[]) => {
    activeRestores++;
    maxRestores = Math.max(maxRestores, activeRestores);
    try {
      return await restore(...args);
    } finally {
      activeRestores--;
    }
  };
  const emit = slide.emit.bind(slide);
  slide.emit = (event: string, ...args: any[]) => {
    if (event === "syncReceive")
      signals.push({ type: args[0]?.type, id: args[0]?.id, authorId: args[0]?.authorId });
    if (event === "renderError") errors.push("Slide renderError");
    return emit(event, ...args);
  };
}
function sample() {
  observe();
  const proxy = app(),
    c = proxy?.appResult?.controller(),
    slide = engine(),
    m = media();
  const a = m?.rtcAudio || m?.audioPlayer,
    h = a?.howl,
    sound = h?._soundById(a.staticEventId);
  const pluginView =
    appId && manager?._appliancePlugin?.currentManager?.viewContainerManager?.getView(appId);
  return {
    mode,
    backendRequested: backend,
    role,
    registration,
    epoch,
    observerId: room?.observerId,
    phase: room?.phase,
    ready: c?.ready,
    frozen: c?.isFrozen,
    appId,
    appVersions: Array.from(document.querySelectorAll("[data-app-slide-version]"), e =>
      e.getAttribute("data-app-slide-version")
    ),
    page: slide?.slideState.currentSlideIndex,
    storagePage: c?.context.storage.state.state?.currentSlideIndex,
    renderedPage: slide?.player?.currentStage?.ctx.slideIndex,
    loading: slide?.isLoading,
    scene: proxy?.view?.focusScenePath,
    sharedPath: proxy?.appAttributes?.fullPath,
    pluginScene: pluginView?.focusScenePath,
    workerActive: manager?._appliancePlugin?.currentManager?.hasOffscreenCanvas,
    storedSrc: manager?.attributes?.registered?.Slide?.src,
    sceneWrites,
    stateWrites,
    activeRestores,
    maxRestores,
    mediaId: m?.id,
    mediaType: m?.type,
    isPlaying: m?.isPlaying,
    backend: h?._webAudio ? "webaudio" : h ? "html5" : undefined,
    audioPaused: a?.isPaused,
    audioTime: a?.currentTime,
    audioNodePaused: h?._webAudio ? undefined : sound?._node?.paused,
    audioNodeTime: sound?._node?.currentTime,
    audioDuration: sound?._node?.duration,
    audioReadyState: sound?._node?.readyState,
    audioEnded: sound?._node?.ended,
    audioSounds: h?._sounds?.map((s: any) => ({
      id: s._id,
      paused: s._paused,
      time: s._node?.currentTime,
      duration: s._node?.duration,
    })),
    webAudioSourceActive: h?._webAudio ? !!sound?._node?.bufferSource : undefined,
    videoPaused: m?.videoElement?.paused,
    videoTime: m?.videoElement?.currentTime,
    engineMediaState: m && slide?.slideState.mediaState[m.id],
    storageMediaState: m && c?.context.storage.state.state?.mediaState?.[m.id],
    mainSeqStep: slide?.mainSeqStep,
    mainSeqLength: slide?.mainSeqLength,
    hasNextAnimation: slide?.player?.mainSeqHasNextStep(),
    storageMainSeqStep: c?.context.storage.state.state?.mainSeqStep,
    signals: signals.slice(),
    errors: errors.slice(),
    resultReady: !!proxy?.appResult,
    storageKeys: Object.keys(proxy?.appContext?.storage.state || {}),
    resourceTaskId: proxy?.appContext?.storage.state?.taskId,
    debugContent: document.querySelector("#board")?.innerHTML.slice(-600),
    debugSlide: document.querySelector("[data-app-slide-version]")?.innerHTML.slice(0, 1800),
    debugVisibility: document.visibilityState,
  };
}
await WindowManager.register({
  kind: "Slide",
  name: "NetlessAppSlide",
  src: registration === "esm" ? async () => bundle!.default : location.origin + "/app/main.iife.js",
  appOptions: {
    useLocalCache: false,
    ...(backend === "webaudio" ? { enableWebAudio: false } : {}),
    loaderDelegate: {
      async loadJson(url: string) {
        if (slow) await new Promise(r => setTimeout(r, 400));
        const response = await fetch(url);
        if (!response.ok) throw Error("Fixture JSON unavailable");
        return response.text();
      },
      async loadImage(url: string) {
        const response = await fetch(url);
        if (!response.ok) throw Error("Fixture image unavailable");
        return response.blob();
      },
      redirectMedia: (url: string) => url,
    },
    onRenderError: () => errors.push("app-slide onRenderError"),
  },
});
const sdk = new WhiteWebSdk({
  appIdentifier: config.appIdentifier,
  region: config.region,
  useMobXState: true,
});
const room = await sdk.joinRoom({
  uuid: config.uuid,
  roomToken: config.roomToken,
  uid: `${config.runId}-${mode}-${backend}-${role}`,
  isWritable: role !== "reader",
  useMultiViews: true,
  disableMagixEventDispatchLimit: true,
  invisiblePlugins: mode === "1.5" ? [WindowManager, ApplianceMultiPlugin] : [WindowManager],
});
const manager = await WindowManager.mount({
  room,
  container: document.querySelector("#board")!,
  chessboard: false,
  cursor: false,
  supportAppliancePlugin: mode === "1.5",
});
if (mode === "1.5")
  await ApplianceMultiPlugin.getInstance(manager, {
    options: { cdn: { fullWorkerUrl, subWorkerUrl }, extras: { useWorker: "auto" } },
  });
if (role === "writer-a" && Object.keys(manager.apps || {}).length === 0) {
  void manager
    .addApp({
      kind: "Slide",
      options: { scenePath: "/media-e2e-fixture", title: "Synthetic media acceptance" },
      attributes: { taskId: "media-fixture", url: location.origin + "/fixture" },
    })
    .then(
      id => {
        appId = id;
      },
      error => errors.push(error.name || "addApp error")
    );
}
setInterval(() => {
  for (const id of Object.keys(manager.apps || {})) appId = id;
  observe();
}, 50);
(window as any).appMediaGate = {
  sample,
  page(index: number) {
    return app()?.appResult?.jumpToPage(index);
  },
  play() {
    media().controller.playButton.click();
  },
  pause() {
    media().controller.pauseButton.click();
  },
  seek(time: number) {
    media().ctx.eventHub.emit("mediaSeek", {
      id: media().id,
      time,
      isPlaying: media().isPlaying,
      _stateOnly: false,
    });
  },
  freeze() {
    return app().appResult.controller().freeze();
  },
  unfreeze() {
    return app().appResult.controller().unfreeze();
  },
  freezeWhileRestoring() {
    const c = app().appResult.controller();
    return Promise.all([c.unfreeze(), c.freeze()]);
  },
  async reconnect() {
    const active = [...sockets].filter(socket => socket.readyState === WebSocket.OPEN);
    if (!active.length) throw Error("No real transport to interrupt");
    for (const socket of active) socket.close(4000, "app-slide E2E transport interruption");
  },
  async selectDocument(taskId: string, url: string, title: string) {
    const previous = appId;
    await manager.closeApp(previous);
    appId = await manager.addApp({
      kind: "Slide",
      options: { scenePath: "/media-e2e-" + taskId, title },
      attributes: { taskId, url },
    });
  },
  async seedOld() {
    await WindowManager.register({
      ...WindowManager.registered.get("Slide"),
      kind: "Slide",
      src: location.origin + "/old/main.iife.js",
      name: "NetlessAppSlide",
    });
  },
  nextStep() {
    return engine().nextStep();
  },
  close: disconnect,
};
let disconnectPromise: Promise<void> | undefined;
function disconnect() {
  if (!disconnectPromise) {
    disconnectPromise = room.phase === "disconnected" ? Promise.resolve() : room.disconnect();
  }
  return disconnectPromise;
}
addEventListener("pagehide", () => void disconnect());
