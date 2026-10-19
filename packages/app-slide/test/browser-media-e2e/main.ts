import { WhiteWebSdk, LoggerReportMode } from "white-web-sdk";
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
const observedMedia = new WeakSet<object>();
const observedPlayers = new WeakSet<object>();
const mediaActions: object[] = [];
const resourceLoads: { path: string; durationMs: number }[] = [];
let appId: string, observedController: any, observedProxy: any;
let sceneWrites = 0,
  stateWrites = 0,
  epoch = 0,
  activeRestores = 0,
  maxRestores = 0;
let frozenCalls = 0,
  releaseCalls = 0;
let permissionRequests = 0,
  permissionGestures = 0;
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
  activeRestores = 0;
  maxRestores = 0;
  let controllerRestores = 0,
    controllerMaxRestores = 0;
  proxy.appResult.onPptMediaPermissionRequest?.(() => {
    permissionRequests++;
  });
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
  for (const method of ["frozen", "release"]) {
    const original = slide[method].bind(slide);
    slide[method] = (...args: any[]) => {
      if (method === "frozen") frozenCalls++;
      else releaseCalls++;
      return original(...args);
    };
  }
  const restore = slide.setSlideState.bind(slide);
  slide.setSlideState = async (...args: any[]) => {
    controllerRestores++;
    controllerMaxRestores = Math.max(controllerMaxRestores, controllerRestores);
    if (observedController === controller) {
      activeRestores = controllerRestores;
      maxRestores = controllerMaxRestores;
    }
    try {
      return await restore(...args);
    } finally {
      controllerRestores--;
      if (observedController === controller) activeRestores = controllerRestores;
    }
  };
  const emit = slide.emit.bind(slide);
  slide.emit = (event: string, ...args: any[]) => {
    if (event === "syncReceive")
      signals.push({
        type: args[0]?.type,
        id: args[0]?.id,
        authorId: args[0]?.authorId,
        state: args[0]?.state && { ...args[0].state },
      });
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
  const execution = (track: any, owner: any) => {
    const p = track?.pending;
    return (
      track && {
        revision: track.revision,
        desiredPlaying: track.desiredPlaying,
        suspended: track.isSuspended,
        pending: p && {
          revision: p.revision,
          time: p.time,
          resume: p.resume,
          live: p.live,
          remainingMs: p.deadline - Date.now(),
          corrections: p.corrections,
          appliedTime: p.applied?.time,
          appliedToCurrentOwner: p.applied?.owner === owner,
        },
      }
    );
  };
  if (slide?.player && !observedPlayers.has(slide.player)) {
    const player = slide.player;
    observedPlayers.add(player);
    const original = player.setMediaState.bind(player);
    player.setMediaState = async (id: string, play: boolean, time?: number, now?: () => number) => {
      const target = Object.values(player.currentStage?.ctx.medias || {}).find(
        (x: any) => x.id === id
      ) as any;
      const entry: any = {
        name: "setMediaState",
        id,
        play,
        time,
        at: Date.now(),
        duration: target?.clippedDuration,
        ready: target?.isReadyForUserGesture,
        active: target?.ctx.stageClock.isActive,
        target: now ? String(now()) : undefined,
      };
      mediaActions.push(entry);
      try {
        return await original(id, play, time, now);
      } finally {
        Object.assign(entry, {
          finished: Date.now(),
          afterDuration: target?.clippedDuration,
          afterPlaying: target?.isPlaying,
          afterActive: target?.ctx.stageClock.isActive,
          afterTarget: now ? String(now()) : undefined,
        });
      }
    };
  }
  if (m && !observedMedia.has(m)) {
    observedMedia.add(m);
    for (const name of ["play", "pause", "stop", "destroy"]) {
      const original = m[name].bind(m);
      m[name] = (...args: any[]) => {
        mediaActions.push({
          name,
          id: m.id,
          at: Date.now(),
          time: m.currentTime,
          stack: new Error().stack?.split("\n").slice(1, 6),
        });
        return original(...args);
      };
    }
  }
  const pluginView =
    appId && manager?._appliancePlugin?.currentManager?.viewContainerManager?.getView(appId);
  const medias = Object.values(slide?.player?.currentStage?.ctx?.medias || {}) as any[];
  const sounds = medias.flatMap(m => {
    const audio = m.rtcAudio || m.audioPlayer;
    return audio?.howl?._sounds || [];
  });
  const native = (window as any).__nativeMediaProbe?.sample(
    [...sounds.map(s => s._node), ...medias.map(m => m.videoElement)].filter(Boolean),
    sounds.map(s => s._node?.bufferSource).filter(Boolean)
  );
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
    frozenCalls,
    releaseCalls,
    playerExists: !!slide?.player,
    writable: room?.isWritable,
    now: slide?.timestamp(),
    native,
    mediaCount: medias.length,
    allMedias: medias.map(m => ({
      id: m.id,
      playing: m.isPlaying,
      time: m.currentTime,
      duration: m.clippedDuration,
      audioTime: (m.rtcAudio || m.audioPlayer)?.currentTime,
      audioPaused: (m.rtcAudio || m.audioPlayer)?.isPaused,
      needsGesture: m.needsUserGesture,
    })),
    clippedDuration: m?.clippedDuration,
    videoDuration: m?.videoElement?.duration,
    videoReadyState: m?.videoElement?.readyState,
    videoSeeking: m?.videoElement?.seeking,
    videoExecution: execution(m?.videoExecution, m?.videoElement),
    audioExecution: execution(a?.execution, h),
    howlState: h?._state,
    howlQueue: h?._queue?.map((entry: any) => entry.event),
    playerPaused: slide?.player?.isPaused,
    stageActive: m?.ctx?.stageClock?.isActive,
    mediaActions: mediaActions.slice(-12),
    pendingSyncEvents: c?.pendingSyncEvents?.map((event: any) => ({
      type: event.type,
      id: event.id,
      slideIndex: event.slideIndex,
      state: event.state,
    })),
    slowResourceLoads: resourceLoads.filter(r => r.durationMs > 1000).slice(-20),
    trimStart: m?.controller?.start || 0,
    needsGesture: m?.needsUserGesture,
    permissionRequests,
    permissionGestures,
    audioContextState: sound?._node?.context?.state,
    storedMediaStates: c?.context.storage.state.state?.mediaState,
    mediaId: m?.id,
    mediaType: m?.type,
    isPlaying: m?.isPlaying,
    backend: h?._webAudio ? "webaudio" : h ? "html5" : undefined,
    audioPaused: a?.isPaused,
    audioTime: a?.currentTime,
    audioNodePaused: h?._webAudio ? undefined : sound?._node?.paused,
    howlLock: h?._playLock,
    globalAudioContextState: (window as any).Howler?.ctx?.state,
    audioNodeTime: sound?._node?.currentTime,
    audioNodeSeeking: h?._webAudio ? undefined : sound?._node?.seeking,
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
    videoSpriteVisible: m?.sprite?.visible,
    videoWorldVisible: m?.sprite?.worldVisible,
    engineMediaState: m && slide?.slideState.mediaState[m.id],
    storageMediaState: m && c?.context.storage.state.state?.mediaState?.[m.id],
    mainSeqStep: slide?.mainSeqStep,
    mainSeqLength: slide?.mainSeqLength,
    hasNextAnimation: slide?.player?.mainSeqHasNextStep(),
    storageMainSeqStep: c?.context.storage.state.state?.mainSeqStep,
    mediaPauseCount: signals.filter(e => e.type === "mediaPause").length,
    mediaSeekCount: signals.filter(e => e.type === "mediaSeek").length,
    receivedSignalCount: signals.length,
    signals: signals.slice(-80),
    errors: errors.slice(),
    resultReady: !!proxy?.appResult,
    storageKeys: Object.keys(proxy?.appContext?.storage.state || {}),
    resourceTaskId: proxy?.appContext?.storage.state?.taskId,
    debugVisibility: document.visibilityState,
  };
}
await WindowManager.register({
  kind: "Slide",
  name: "NetlessAppSlide",
  src: registration === "esm" ? async () => bundle!.default : location.origin + "/app/main.iife.js",
  appOptions: {
    useLocalCache: false,
    // Functional media acceptance uses live CDN assets; keep download latency
    // separate from the stricter native playback/clock deadlines.
    resourceTimeout: 60000,
    ...(backend === "webaudio" ? { enableWebAudio: false } : {}),
    loaderDelegate: {
      async loadJson(url: string) {
        if (slow) await new Promise(r => setTimeout(r, 400));
        const response = await fetch(url);
        if (!response.ok) throw Error("Fixture JSON unavailable");
        return response.text();
      },
      async loadImage(url: string) {
        const started = performance.now();
        const response = await fetch(url);
        if (!response.ok) throw Error("Fixture image unavailable");
        const blob = await response.blob();
        resourceLoads.push({
          path: new URL(url).pathname,
          durationMs: performance.now() - started,
        });
        return blob;
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
  // SDK telemetry transport is separate from media/room acceptance. Disable it
  // through the SDK API, keeping all product errors and media failures visible.
  loggerOptions: {
    reportDebugLogMode: LoggerReportMode.BanReport,
    reportQualityMode: LoggerReportMode.BanReport,
    localLog: { enabled: false, enabledUpload: false },
  },
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
  stop() {
    media().stop();
  },
  seek(time: number) {
    const current = media();
    const slide = engine();
    const requestedAt = slide.timestamp();
    const playing = current.isPlaying;
    const receivedBefore = signals.filter(event => event.type === "mediaSeek").length;
    current.ctx.eventHub.emit("mediaSeek", {
      id: current.id,
      time,
      isPlaying: playing,
      _stateOnly: false,
    });
    return {
      id: current.id,
      time,
      playing,
      requestedAt,
      completedAt: slide.timestamp(),
      receivedBefore,
      state: { ...slide.slideState.mediaState[current.id] },
    };
  },
  prepareControls() {
    // The product's clicker tool routes real pointer events through the drawing layer.
    room.setMemberState({ currentApplianceName: "clicker" });
    const c = media().controller;
    c.show();
    for (const [field, name] of [
      ["playButton", "play"],
      ["pauseButton", "pause"],
      ["progress", "progress"],
    ]) {
      c[field].setAttribute("data-e2e-media", name);
    }
  },
  playAll() {
    for (const m of Object.values(engine().player.currentStage.ctx.medias) as any[])
      m.controller.playButton.click();
  },
  playMedia(index: number) {
    (Object.values(engine().player.currentStage.ctx.medias) as any[])[
      index
    ].controller.playButton.click();
  },
  pauseMedia(index: number) {
    (Object.values(engine().player.currentStage.ctx.medias) as any[])[
      index
    ].controller.pauseButton.click();
  },
  pauseAll() {
    for (const m of Object.values(engine().player.currentStage.ctx.medias) as any[])
      m.controller.pauseButton.click();
  },
  async cancelActiveSeek() {
    const m = media(),
      audio = m.rtcAudio || m.audioPlayer;
    m.pause();
    audio.play();
    const pendingSeek = m.seek(5);
    const howl = audio.howl,
      node = howl?._soundById(audio.staticEventId)?._node;
    const nativePlayPending = howl?._playLock === true;
    await engine().player.setMediaState(m.id, false, 5);
    await pendingSeek;
    // Publish the actual controller event so all participants also traverse Magix.
    m.ctx.eventHub.emit("mediaPause", { id: m.id, time: 5 });
    return {
      nativePlayPending,
      retired: howl !== audio.howl,
      reusedRetiredNode:
        howl !== audio.howl && node === audio.howl?._soundById(audio.staticEventId)?._node,
    };
  },
  async cancelUnlockedNativeSeek() {
    const m = media(),
      audio = m.rtcAudio || m.audioPlayer;
    const pending = m.seek(4);
    const deadline = performance.now() + 3000;
    let observed;
    while (performance.now() < deadline) {
      const h = audio.howl,
        node = h?._soundById(audio.staticEventId)?._node;
      if (node?.seeking && h._playLock === false) {
        observed = sample();
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!observed) throw Error("Real unlocked native seek window was not observed");
    await engine().player.setMediaState(m.id, false, 4);
    await pending;
    m.ctx.eventHub.emit("mediaPause", { id: m.id, time: 4 });
    return { observed, final: sample() };
  },
  async removeDocument() {
    await manager.closeApp(appId);
    appId = "";
  },
  async fixture(taskId = "media-fixture") {
    appId = await manager.addApp({
      kind: "Slide",
      options: { scenePath: "/media-e2e-" + taskId, title: taskId },
      attributes: { taskId, url: location.origin + "/fixture" },
    });
  },
  recoverPermission() {
    return app().appResult.playPptMedia();
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
document.querySelector("#media-permission")!.addEventListener("click", () => {
  permissionGestures++;
  const m = media(),
    audio = m?.rtcAudio || m?.audioPlayer;
  const context = audio?.howl?._soundById(audio.staticEventId)?._node?.context;
  if (context?.state === "suspended")
    void context.resume().catch(() => errors.push("AudioContext gesture resume failed"));
  app()?.appResult?.playPptMedia();
});
