import type { Attributes } from ".";
import Plyr, { Provider } from "plyr";
import { cannotPlayHLSNatively, guessTypeFromSrc, hlsTypes, loadHLS } from "./utils";
import { debounce, isBoolean, isEqual, isNumber } from "lodash";
import { AppContext, Player, Room } from "@netless/window-manager";
import type { Logger } from "white-web-sdk";

export interface PlayerOption {
  context: AppContext<Attributes>;
}

/**
 * 播放器操作类型
 * - play: 播放
 * - seek: 跳转
 * - volume: 音量
 * - muted: 静音
 */
export type PlayerOperationType = "play" | "seek" | "volume" | "muted";

/**
 * 权限类型
 * - sync: 同步权限
 * - local: 本地权限
 * - none: 无权限
 */
export type PermissionType = "sync" | "local" | "none";

/**
 * 播放状态
 * - [false, number]: 正在播放状态, 播放开始时间
 * - [true, number, number]: 正在暂停状态, 播放开始时间, 暂停时间
 */
export type PlayTimeState = [false, number] | [true, number, number];

export class Controller {
  public player?: Plyr;
  /** 需要同步的操作, 默认操作都不同步 */
  protected forceSyncOperation: Set<PlayerOperationType> = new Set();
  /** 不需要同步的进度时间, 默认seek都同步 */
  protected notSyncSeekTimeSet: Set<number> = new Set();
  protected timeIntervaler = 0;
  protected syncPromeResolveMap: Map<
    number,
    {
      count: number;
      timer: number | null;
      resolve: () => void;
    }
  > = new Map();
  protected controlDomResolve: {
    timer: number | null;
    resolve: () => void;
  } | null = null;
  readonly context: AppContext<Attributes>;
  public readonly playerContainer!: HTMLDivElement;
  public readonly plyrElement!: HTMLAudioElement | HTMLVideoElement | HTMLDivElement;
  public customControls?: CustomPlyrControls;
  protected lastSyncState: Partial<Pick<Attributes, "volume" | "muted" | "playTimeState">> = {};
  public readonly logger: Logger;
  protected checkIntervaler: number | null = null;
  private isDestroying = false;
  public constructor(context: AppContext<Attributes>, logger: Logger) {
    this.context = context;
    this.logger = logger;
    const { src, provider, type, poster } = this.context.storage.state;
    const _type = provider ? undefined : type || guessTypeFromSrc(src);
    const {plyrElement, playerContainer} = this.createPlayerContainer({ src, poster, provider, type: _type });
    this.plyrElement = plyrElement;
    this.playerContainer = playerContainer;
    // (window as any).plyrController = this;
  }

  get room(): Room | undefined {
    return this.context.getRoom();
  }

  get displayer(): Player | undefined {
    return this.context.getDisplayer() as Player;
  }

  get uid(): string {
    return this.room?.uid || this.displayer?.observerId.toString() || "";
  }

  /**
   * 服务器近似时间戳
   */
  get calibrationTimestamp(): number {
    return this.room
      ? this.room.calibrationTimestamp
      : this.displayer
      ? this.displayer.beginTimestamp + this.displayer?.progressTime
      : 0;
  }

  /**
   * 播放器进度时长,单位毫秒
   */
  get progressTime(): number {
    if (this.playTimeState) {
      if (this.playTimeState[0] && this.playTimeState[1] && this.playTimeState[2]) {
        return Math.min(this.playTimeState[2] - this.playTimeState[1], this.duration * 1000);
      } else if (this.playTimeState[0] === false && this.playTimeState[1]) {
        return Math.min(this.calibrationTimestamp - this.playTimeState[1], this.duration * 1000);
      }
    }
    return 0;
  }

  get volumeData(): number {
    return this.context.storage.state.volume || 1;
  }

  get mutedData(): boolean {
    return this.context.storage.state.muted || false;
  }

  get volume(): number {
    return this.context.storage.state.volume || 1;
  }

  get muted(): boolean {
    return this.context.storage.state.muted || false;
  }

  get currentTime(): number {
    return this.player?.currentTime || 0;
  }

  get duration(): number {
    return this.player?.duration || 3600;
  }
  get useCustomControls(): boolean {
    return this.context.storage.state.useCustomControls || false;
  }

  get playTimeState(): PlayTimeState | undefined {
    return this.context.storage.state.playTimeState || undefined;
  }

  protected hasPermission = (_operation: PlayerOperationType): PermissionType => {
    // todo 如果客户需要更细粒度的权限控制，可以在这里添加
    if (_operation === "volume" && !this.context.storage.state.syncVolume) {
      return "local";
    }
    if (_operation === "muted" && !this.context.storage.state.syncMuted) {
      return "local";
    }
    if (this.context.getIsWritable()) {
      return "sync";
    }
    return "none";
  };

  protected attrsUpdateHandler = debounce(() => {
    if (!this.player) {
      return;
    }
    if (!this.player.elements) {
      return;
    }
    this.logger.info(
      "[Plyr] sync attrsUpdateHandler",
      "volume:" + this.player.volume,
      "volumeData:" + this.volumeData,
      "muted:" + this.player.muted,
      "mutedData:" + this.mutedData,
      "paused:" + this.player.paused,
      "playTimeState:" + this.playTimeState,
    );
    const willUpdateAttr: {
      volume?: number;
      muted?: boolean;
      playTimeState?: PlayTimeState;
    } = {};
    if (this.lastSyncState?.volume !== this.volumeData && this.context.storage.state.syncVolume) {
      willUpdateAttr.volume = this.volumeData;
      this.lastSyncState.volume = this.volumeData;
    }
    if (this.lastSyncState?.muted !== this.mutedData && this.context.storage.state.syncMuted) {
      willUpdateAttr.muted = this.mutedData;
      this.lastSyncState.muted = this.mutedData;
    }
    if (!isEqual(this.lastSyncState?.playTimeState, this.playTimeState)) {
      willUpdateAttr.playTimeState = this.playTimeState;
      this.lastSyncState.playTimeState = this.playTimeState;
    }
    if (Object.keys(willUpdateAttr).length > 0) {
      this.willSyncPlayerState(willUpdateAttr);
      // this.logger.info("[Plyr] attrsUpdateHandler willUpdateAttr", JSON.stringify(willUpdateAttr));
    }
  }, 50);

  protected syncPlayTimeState = (progressTime: number) => {
    const _resovle = this.syncPromeResolveMap.get(progressTime);
    if (_resovle) {
      const buffered = this.player?.buffered ?? undefined;
      if (buffered || _resovle.count > 100) {
        _resovle.resolve();
        if (_resovle.timer) {
          window.clearTimeout(_resovle.timer);
          _resovle.timer = null;
        }
      } else {
        _resovle.count++;
        _resovle.timer = this.resovleTimer(progressTime);
      }
    }
  };

  protected resovleTimer = (key: number) => {
    return window.setTimeout(() => {
      this.syncPlayTimeState(key);
    }, 100);
  };

  protected willSyncPlayerState = async (target: {
    volume?: number;
    muted?: boolean;
    playTimeState?: PlayTimeState;
  }) => {
    if (this.player) {
      const { volume, muted, playTimeState } = target;
      console.log("[Plyr] willSyncPlayerState", volume, muted, playTimeState);
      if (isNumber(volume)) {
        this.player.volume = volume as number;
        if (this.customControls) {
          this.customControls.volume(volume);
        }
      }
      if (isBoolean(muted)) {
        this.player.muted = muted as boolean;
        if (this.customControls) {
          this.customControls.volume(volume || this.player.volume, muted);
        }
      }
      if (playTimeState) {
        await this.willsyncPlayTimeState(playTimeState);
      }
    }
  };

  protected willsyncPlayTimeState = async (playTimeState: PlayTimeState) => {
    const progressTime = this.progressTime / 1000;
    const resovle = this.syncPromeResolveMap.get(progressTime);
    if (resovle) {
      if (resovle.timer) {
        window.clearTimeout(resovle.timer);
      }
      this.syncPromeResolveMap.delete(progressTime);
    }
    await new Promise<void>(resolve => {
      this.syncPromeResolveMap.set(progressTime, {
        count: 0,
        timer: null,
        resolve,
      });
      this.syncPlayTimeState(progressTime);
    }).then(() => {
      if (this.player) {
        const _progressTime = this.progressTime / 1000;
        this.player.currentTime = _progressTime;
        this.notSyncSeekTimeSet.add(Math.floor(_progressTime));
      }
      this.syncPromeResolveMap.delete(progressTime);
    });
    if (this.customControls && !this.customControls.isDraggingProgress) {
      this.customControls.currentTime(progressTime, this.duration);
    }
    if (playTimeState[0]) {
      console.log("[Plyr] willSyncPlayerState safePause");
      this.safePause();
      if (this.customControls) {
        this.customControls.pause(playTimeState[0]);
      }
    }
    if (!playTimeState[0]) {
      await this.safePlay();
      if (this.customControls) {
        this.customControls.pause(this.player?.paused || false);
      }
    }
  }

  safePause = () => {
    if (!this.player) {
      return;
    }
    if (!this.player.paused) {
      this.player.pause();
    }
    return;
  };

  safePlay = async (loop = 0) => {
    if (!this.player) {
      return;
    }
    if (loop > 3) {
      this.logger.error("[Plyr] play error loop overflow", loop);
      return;
    }
    console.log("[Plyr] play error safePlay start");
    try {
      loop++;
      if (this.player.paused) {
        await this.player.play();
      }
    } catch (error) {
      // console.error("[Plyr] play error", error);
      this.logger.warn("[Plyr] play error", (error as Error)?.message ?? error)
      if (this.player) {
        this.player.muted = true;
        if (this.customControls) {
          this.customControls.volume(this.player.volume, true);
        }
        await this.safePlay(loop);
        console.log("[Plyr] play error safePlay end");
      }
    }
  };

  protected createYoutubeContainer(src: string, poster?: string): HTMLDivElement {
    const container = document.createElement("div");
    container.classList.add("plyr__video-embed");
    container.setAttribute("data-app-kind", "Plyr");
    container.setAttribute("data-plyr-provider", "youtube");
    container.setAttribute("data-plyr-embed-id", src);
    poster && container.setAttribute("data-poster", poster);
    return container;
  }

  protected createVimeoContainer(src: string, poster?: string): HTMLDivElement {
    const container = document.createElement("div");
    container.classList.add("plyr__video-embed");
    container.setAttribute("data-app-kind", "Plyr");
    container.setAttribute("data-plyr-provider", "vimeo");
    container.setAttribute("data-plyr-embed-id", src);
    poster && container.setAttribute("data-poster", poster);
    return container;
  }

  protected createAudioContainer(src: string, type: string, poster?: string): HTMLAudioElement {
    const container = document.createElement("audio");
    container.setAttribute("data-app-kind", "Plyr");
    container.setAttribute("crossorigin", "anonymous");
    poster && container.setAttribute("data-poster", poster);
    const source = document.createElement("source");
    source.setAttribute("src", src);
    source.setAttribute("type", type);
    container.appendChild(source);
    return container;
  }

  protected createVideoContainer(src: string, type: string, poster?: string): HTMLVideoElement {
    const container = document.createElement("video");
    container.setAttribute("data-app-kind", "Plyr");
    container.setAttribute("crossorigin", "anonymous");
    container.setAttribute("playsinline", "true");
    poster && container.setAttribute("data-poster", poster);
    const source = document.createElement("source");
    source.setAttribute("src", src);
    source.setAttribute("type", type);
    container.appendChild(source);
    return container;
  }

  protected createPlayerContainer(option: {
    src: string;
    poster?: string;
    provider?: Provider;
    type?: string;
  }) {
    const { src, poster, provider, type } = option;
    const container = document.createElement("div");
    container.classList.add("plyr-container");
    let plyrElement: HTMLDivElement | HTMLAudioElement | HTMLVideoElement | undefined;
    if (provider === "youtube") {
      plyrElement = this.createYoutubeContainer(src, poster);
      container.classList.add("plyr-container-video-embed");
    } else if (provider === "vimeo") {
      plyrElement = this.createVimeoContainer(src, poster);
      container.classList.add("plyr-container-video-embed");
    } else if (type) {
      if (type.startsWith("audio/")) {
        plyrElement = this.createAudioContainer(src, type, poster);
        container.classList.add("plyr-container-audio");
      } else {
        plyrElement = this.createVideoContainer(src, type, poster);
        container.classList.add("plyr-container-video");
      }
    } else {
      container.classList.add("plyr-container-audio");
      plyrElement = document.createElement("div");
      plyrElement.classList.add("plyr--audio");
      plyrElement.setAttribute("data-app-kind", "Plyr");
      plyrElement.innerText = `Invalid "src" or "type". ${JSON.stringify({ src, type })}`;
    }
    container.appendChild(plyrElement);
    return {plyrElement: plyrElement, playerContainer: container};
  }

  public async mountPlayer(): Promise<void> {
    const { src, provider, type, paused, customControlsTitle, syncMuted, syncVolume } =
      this.context.storage.state;
    const _type = provider ? undefined : type || guessTypeFromSrc(src);
    const useHLS = hlsTypes.includes(String(_type).toLowerCase());
    this.cancleCalibrationProgressTime();
    this.cancelKeepCheckPlayerStateInSync();
    const isAutoPlay = !paused;
    if (this.plyrElement) {
      if (useHLS && cannotPlayHLSNatively(this.plyrElement)) {
        const hls = await loadHLS();
        hls.loadSource(src);
        hls.attachMedia(this.plyrElement);
      }
      try {
        this.player = new Plyr(this.plyrElement, {
          fullscreen: { enabled: false },
          controls: this.useCustomControls
            ? []
            : ["play", "progress", "current-time", "mute", "volume"],
          clickToPlay: false,
          youtube: {
            autoplay: isAutoPlay,
          },
          hideControls: false,
          autoplay: isAutoPlay,
          volume: this.volumeData,
          muted: this.mutedData,
        });
      } catch (error) {
        console.error("[Plyr] mountPlayer error", error);
        this.logger.error("[Plyr] mountPlayer error", (error as Error)?.message ?? error);
        return;
      }
      
      // 如果是 YouTube 视频，添加超时检查和错误监听
      if (provider === "youtube") {
        this.setupYouTubeErrorHandling();
      }
      if (this.player) {
        if (this.useCustomControls) {
          this.customControls = new CustomPlyrControls(this, this.player);
          this.customControls.title(customControlsTitle || "");
        }
        this.player.on("ended", () => {
          if (this.player) {
            const currentTime = this.player.currentTime;
            console.log("[Plyr] ended, currentTime:", currentTime);
            this.player?.pause();
            if (this.customControls) {
              this.customControls.pause(true, true);
            }
            this.cancleCalibrationProgressTime();
            this.cancelKeepCheckPlayerStateInSync();
          }
        });
        this.player.on("ready", () => {
          if (this.player) {
            if (this.customControls) {
              this.customControls.init();
            }
            this.attrsUpdateHandler();
            this.context.storage.addStateChangedListener(this.attrsUpdateHandler);
            this.keepCheckPlayerStateInSync();
          }
          // window.mediaPlayer = this.player;
          console.log("[Plyr] ready, buffered:", this.player?.buffered);
        });
        this.player.on("seeked", () => {
          if (this.player) {
            const key = Math.floor(this.player.currentTime);
            const playPermission = this.hasPermission("seek");
            if (playPermission === "sync" && !this.notSyncSeekTimeSet.has(key)) {
              if (key !== Math.floor(this.progressTime / 1000)) {
                this.willActiveUpdatePlayTimeState();
              }
            }
            if (this.notSyncSeekTimeSet.has(key)) {
              this.notSyncSeekTimeSet.delete(key);
            }
            console.log("[Plyr] seeked, seeking:", this.player?.seeking);
          }
        });
        this.player.on("play", () => {
          if (this.player) {
            const playPermission = this.hasPermission("play");
            if (playPermission === "sync") {
              if (this.forceSyncOperation.has("play")) {
                this.willActiveUpdatePlayTimeState();
              } else if (isAutoPlay && !this.player.paused && !this.playTimeState) {
                this.willActiveUpdatePlayTimeState();
              }
            }
            this.forceSyncOperation.delete("play");
            console.log("[Plyr] play, paused:", this.player?.paused);
            this.calibrationProgressTime();
            this.keepCheckPlayerStateInSync();
          }
        });
        this.player.on("pause", () => {
          if (this.player) {
            const playPermission = this.hasPermission("play");
            if (playPermission === "sync" && this.forceSyncOperation.has("play")) {
              console.log("[Plyr] pause by sync, paused:", this.player?.paused);
              this.willActiveUpdatePlayTimeState();
            }
            this.forceSyncOperation.delete("play");
            console.log("[Plyr] pause, paused:", this.player?.paused);
            this.cancleCalibrationProgressTime();
            this.keepCheckPlayerStateInSync();
          }
        });
        this.player.on("timeupdate", () => {
          if (this.player && this.customControls && !this.customControls.isDraggingProgress) {
            this.customControls.currentTime(this.progressTime / 1000, this.duration);
          }
        });
        this.player.on("volumechange", () => {
          if (this.player) {
            const volumePermission = this.hasPermission("volume");
            const mutePermission = this.hasPermission("muted");
            if (volumePermission === "sync" || mutePermission === "sync") {
              if (volumePermission === "sync" && this.forceSyncOperation.has("volume")) {
                this.setVolumeData(this.player.volume);
              }
              if (mutePermission === "sync" && this.forceSyncOperation.has("muted")) {
                this.setMutedData(this.player.muted);
              }
            }
            if (this.customControls) {
              if (!syncVolume || !syncMuted) {
                this.customControls.volume(this.player.volume, this.player.muted);
              }
            }
            this.forceSyncOperation.delete("volume");
            this.forceSyncOperation.delete("muted");
            console.log(
              "[Plyr] volumechange, volume:",
              this.player?.volume,
              "muted:",
              this.player?.muted
            );
          }
        });
        // 监听 Plyr 错误事件
        this.player.on("error", (event: any) => {
          const error = event?.detail || event;
          const errorMessage = error?.message || error?.toString() || "Unknown error";
          console.error("[Plyr] player error event:", error);
          this.logger.error("[Plyr] player error event:", errorMessage);
        });
        await this.setControlPermission();
        (window as any).__plyr = this.player;
      }
    }
  }

  protected initControlDol = () => {
    if (this.player && this.player.elements && this.player.elements.container) {
      if (this.controlDomResolve) {
        const controlsDom = this.player.elements.container.querySelector(
          ".plyr__controls"
        ) as HTMLDivElement;
        if (controlsDom) {
          if (this.controlDomResolve.timer) {
            clearTimeout(this.controlDomResolve.timer);
            this.controlDomResolve.timer = null;
          }
          this.controlDomResolve.resolve();
        } else {
          this.controlDomResolve.timer = this.controlDomTimeClock();
        }
      }
    }
  };

  protected controlDomTimeClock = () => {
    return setTimeout(() => {
      if (this.controlDomResolve && this.controlDomResolve.timer) {
        this.controlDomResolve.timer = null;
      }
      this.initControlDol();
    }, 100) as unknown as number;
  };

  protected activeControlDom = (operation: PlayerOperationType) => {
    this.forceSyncOperation.add(operation);
    console.log("[Plyr] activeControlDom", operation);
  };

  public async setControlPermission() {
    if (
      this.player &&
      (!this.player.elements ||
        !this.player.elements.container ||
        !this.player.elements.container.querySelector(".plyr__controls"))
    ) {
      await new Promise<void>(resolve => {
        this.controlDomResolve = {
          timer: this.controlDomTimeClock(),
          resolve,
        };
      });
    }
    if (this.player && this.player.elements && this.player.elements.container) {
      const controlsDom = this.player.elements.container.querySelector(
        ".plyr__controls"
      ) as HTMLDivElement;
      if (controlsDom && controlsDom.style.pointerEvents === "none") {
        controlsDom.style.pointerEvents = "";
      }
      const volumeControlDom = this.player.elements.container.querySelector(
        ".plyr__volume"
      ) as HTMLInputElement;
      if (volumeControlDom && volumeControlDom.style.pointerEvents === "none") {
        volumeControlDom.style.pointerEvents = "";
      }
      const volumeDom = this.player.elements.container.querySelector(
        ".plyr__volume input"
      ) as HTMLInputElement;
      if (volumeDom && volumeDom.style.pointerEvents === "auto") {
        volumeDom.style.pointerEvents = "";
      }
      const mutedDom = this.player.elements.container.querySelector(
        ".plyr__volume button"
      ) as HTMLButtonElement;
      if (mutedDom && mutedDom.style.pointerEvents === "auto") {
        mutedDom.style.pointerEvents = "";
      }
      const playControlDom = controlsDom.querySelector("button.plyr__control") as HTMLButtonElement;
      console.log("[Plyr] playControlDom", !!playControlDom);
      if (playControlDom) {
        playControlDom.addEventListener("pointerdown", e => {
          console.log("[Plyr] playControlDom pointerdown", e.target);
          this.activeControlDom("play");
        });
      }
      const playPermission = this.hasPermission("play");
      const volumePermission = this.hasPermission("volume");
      const mutedPermission = this.hasPermission("muted");

      // 如果播放权限为非同步，且音量权限和静音权限为无权限，则整个控制面板无法操作
      if (
        playPermission !== "sync" &&
        volumePermission === "none" &&
        mutedPermission === "none" &&
        controlsDom
      ) {
        controlsDom.style.pointerEvents = "none";
        return;
      }
      if (
        playPermission !== "sync" &&
        (volumePermission !== "none" || mutedPermission !== "none") &&
        controlsDom
      ) {
        controlsDom.style.pointerEvents = "none";
        if (volumePermission !== "none" && volumeDom) {
          volumeDom.style.pointerEvents = "auto";
        }
        if (mutedPermission !== "none" && mutedDom) {
          mutedDom.style.pointerEvents = "auto";
        }
        return;
      }
      if (
        playPermission === "sync" &&
        (volumePermission === "none" || mutedPermission === "none") &&
        volumeControlDom
      ) {
        volumeControlDom.style.pointerEvents = "none";
        if (volumePermission !== "none" && volumeDom) {
          volumeDom.style.pointerEvents = "auto";
        }
        if (mutedPermission !== "none" && mutedDom) {
          mutedDom.style.pointerEvents = "auto";
        }
        return;
      }
    }
  }

  protected calibrationProgressTime = (): void => {
    if (this.isDestroying) {
      return;
    }
    this.cancleCalibrationProgressTime();
    this.timeIntervaler = setInterval(() => {
      if (this.player) {
        const playTimeState = this.playTimeState;
        if (playTimeState && playTimeState[0] === false) {
          const progressTime = this.progressTime / 1000;
          // 如果进度时间与当前时间相差大于8秒，则设置进度时间
          if (progressTime - this.player.currentTime >= 8) {
            // this.player.speed = 4;
            this.player.speed = 1;
            this.notSyncSeekTimeSet.add(Math.round(progressTime));
            this.player.currentTime = progressTime;
            this.calibrationProgressTime();
            return;
          }
          // 如果进度时间与当前时间相差大于6秒，则设置速度为3
          if (progressTime - this.player.currentTime >= 6) {
            this.player.speed = 3;
          } else if (progressTime - this.player.currentTime >= 4) {
            this.player.speed = 2;
          } else if (progressTime - this.player.currentTime >= 2) {
            this.player.speed = 1.5;
          } else if (progressTime - this.player.currentTime >= 1) {
            this.player.speed = 1.25;
          } else if (progressTime - this.player.currentTime <= -4) {
            this.player.speed = 0.5;
          } else if (progressTime - this.player.currentTime <= -1) {
            this.player.speed = 0.75;
          } else {
            this.player.speed = 1;
          }
          // console.log("calibrationProgressTime", progressTime - this.player.currentTime, this.player.speed, progressTime, this.player.currentTime);
        }
      }
    }, 4000) as unknown as number;
  };

  protected cancleCalibrationProgressTime = (): void => {
    if (this.timeIntervaler) {
      clearInterval(this.timeIntervaler);
    }
    if (this.player) {
      this.player.speed = 1;
    }
  };

  protected willActiveUpdatePlayTimeState = debounce(() => {
    if (this.player) {
      const currentTime = this.player.currentTime;
      const pause = this.player.paused;
      const calibrationTimestamp = this.calibrationTimestamp;
      const startTimestamp = Math.floor(calibrationTimestamp - currentTime * 1000);
      if (pause === false) {
        this.setPlayTimeStateData([false, startTimestamp]);
      } else {
        this.setPlayTimeStateData([true, startTimestamp, calibrationTimestamp]);
      }
    }
  }, 20);

  protected setVolumeData(volume: number): void {
    console.log("[Plyr] setVolumeData", volume);
    this.context.storage.setState({ volume });
  }

  public setMutedData(muted: boolean): void {
    console.log("[Plyr] setMutedData", muted);
    this.context.storage.setState({ muted });
  }

  protected setPlayTimeStateData(playTimeState: PlayTimeState): void {
    console.log("[Plyr] setPlayTimeStateData", playTimeState);
    this.context.storage.setState({ playTimeState });
  }

  public setVolume(volume: number): void {
    const permission = this.hasPermission("volume");
    switch (permission) {
      case "sync":
        this.setVolumeData(volume);
        break;
      case "local": {
        if (this.player) {
          this.player.volume = volume;
          if (this.customControls) {
            this.customControls.volume(volume);
          }
        }
        break;
      }
      default:
        throw new Error("You are not permission to set volume");
    }
  }

  public setMute(bool: boolean): void {
    const permission = this.hasPermission("muted");
    switch (permission) {
      case "sync":
        this.setMutedData(bool);
        break;
      case "local": {
        if (this.player) {
          this.player.muted = bool;
          if (this.customControls) {
            this.customControls.volume(this.player.volume, bool);
          }
        }
        break;
      }
      default:
        throw new Error("You are not permission to set mute");
    }
  }

  public play(): void {
    const permission = this.hasPermission("play");
    switch (permission) {
      case "sync": {
        let seekTime = this.player?.currentTime || 0;
        if (seekTime >= this.duration) {
          seekTime = 0;
        }
        const calibrationTimestamp = this.calibrationTimestamp;
        const newState = [false, Math.floor(calibrationTimestamp - seekTime * 1000)] as [
          false,
          number
        ];
        return this.setPlayTimeStateData(newState);
      }
      default:
        throw new Error("You are not permission to play");
    }
  }

  public pause(): void {
    const permission = this.hasPermission("play");
    switch (permission) {
      case "sync": {
        const seekTime = this.player?.currentTime || 0;
        const calibrationTimestamp = this.calibrationTimestamp;
        const newState = [
          true,
          Math.floor(calibrationTimestamp - seekTime * 1000),
          calibrationTimestamp,
        ] as [true, number, number];
        return this.setPlayTimeStateData(newState);
      }
      default:
        throw new Error("You are not permission to pause");
    }
  }

  public stop(): void {
    if (!this.player) {
      return;
    }
    const permission = this.hasPermission("play");
    switch (permission) {
      case "sync": {
        const calibrationTimestamp = this.calibrationTimestamp;
        return this.setPlayTimeStateData([
          true,
          calibrationTimestamp - Math.floor(this.player.currentTime * 1000),
          calibrationTimestamp,
        ]);
      }
      default:
        throw new Error("You are not permission to play");
    }
  }

  public seekTime(seekTime: number): void {
    const permission = this.hasPermission("seek");
    switch (permission) {
      case "sync": {
        const calibrationTimestamp = this.calibrationTimestamp;
        const startTime = Math.floor(calibrationTimestamp - seekTime * 1000);
        const playTimeState = this.playTimeState;
        if (playTimeState && playTimeState[0] === false) {
          this.setPlayTimeStateData([false, startTime]);
          return;
        }
        this.setPlayTimeStateData([true, startTime, calibrationTimestamp]);
        break;
      }
      default:
        throw new Error("You are not permission to play");
    }
  }

  protected checkPlayerStateInSync = () => {
    const playTimeState = this.playTimeState;
    if (playTimeState && this.player && playTimeState[0] !== this.player.paused) {
      const willSyncPlayTimeState = this.context.storage.state.allowBackgroundPlayback || document.visibilityState !== "hidden";
      if (willSyncPlayTimeState) {
        this.logger && this.logger.info(`[Plyr] Interval check sync playTimeState: visibilityState: ${document.visibilityState}, player paused: ${this.player.paused},  playTimeState: ${playTimeState[0]}`);
        this.willsyncPlayTimeState(playTimeState)
      }
    }
  }

  protected keepCheckPlayerStateInSync = (): void => {
    if (this.isDestroying) {
      return;
    }
    this.cancelKeepCheckPlayerStateInSync();
    this.checkIntervaler = setInterval(() => {
      this.checkPlayerStateInSync();
    }, 3000) as unknown as number;
  };

  protected cancelKeepCheckPlayerStateInSync = (): void => {
    if (this.checkIntervaler) {
      clearInterval(this.checkIntervaler);
      this.checkIntervaler = null;
    }
  }

  protected youtubeErrorHandler?: (event: ErrorEvent) => void;
  protected youtubeTimeoutTimer?: number;

  protected setupYouTubeErrorHandling(): void {
    // 监听全局 script 加载错误（YouTube iframe API）
    this.youtubeErrorHandler = (event: ErrorEvent) => {
      const target = event.target as HTMLElement;
      // 检查是否是 YouTube iframe API 加载错误
      if (
        target?.tagName === "SCRIPT" &&
        (target as HTMLScriptElement).src?.includes("youtube.com/iframe_api")
      ) {
        this.logger.error(`[Plyr] Failed to load YouTube iframe API: ${event.message || "Network error"}`);
      }
    };
    window.addEventListener("error", this.youtubeErrorHandler, true);

    // 添加超时检查：如果 10 秒后视频还没有准备好，记录警告
    this.youtubeTimeoutTimer = window.setTimeout(() => {
      if (this.player && this.plyrElement) {
        // 检查是否是 YouTube embed 元素
        const isYouTube = this.plyrElement.getAttribute("data-plyr-provider") === "youtube";
        if (isYouTube) {
          // 检查 iframe 是否已加载
          const iframe = this.plyrElement.querySelector("iframe");
          if (!iframe || !iframe.src) {
            const warningMsg = "[Plyr] YouTube iframe not loaded after 10 seconds, may be network issue";
            console.warn(warningMsg);
            this.logger.warn(warningMsg);
          }
        }
      }
    }, 10000) as unknown as number;
  }

  public async destroy(): Promise<void> {
    this.isDestroying = true;
    if (this.player) {
      await new Promise<void>(resolve => {
        setTimeout(() => {
          resolve();
        }, 500);
      });
      this.player?.destroy();
      this.player = undefined;
      this.plyrElement.innerHTML = "";
      if (this.customControls) {
        this.customControls.destory();
        this.customControls = undefined;
      }
      this.playerContainer?.remove();
      this.cancleCalibrationProgressTime();
      this.cancelKeepCheckPlayerStateInSync();
    }
    // 清理 YouTube 错误处理
    if (this.youtubeErrorHandler) {
      window.removeEventListener("error", this.youtubeErrorHandler, true);
      this.youtubeErrorHandler = undefined;
    }
    if (this.youtubeTimeoutTimer) {
      clearTimeout(this.youtubeTimeoutTimer);
      this.youtubeTimeoutTimer = undefined;
    }
  }

}

export class CustomPlyrControls {
  protected controller: Controller;
  protected plyr: Plyr;
  public readonly ui: HTMLDivElement;
  protected PlayButton!: HTMLButtonElement;
  protected MuteButton!: HTMLButtonElement;
  protected VolumeSliderContainer!: HTMLDivElement;
  protected VolumeSlider!: HTMLDivElement;
  protected VolumeSliderButton!: HTMLButtonElement;
  protected CurrentTime!: HTMLSpanElement;
  protected Duration!: HTMLSpanElement;
  protected ProgressSliderContainer!: HTMLDivElement;
  protected ProgressSlider!: HTMLDivElement;
  protected ProgressSliderButton!: HTMLButtonElement;
  protected Title!: HTMLSpanElement;
  protected _isDraggingVolume = false;
  protected _isDraggingProgress = false;
  protected dragStartX?: [number, number];

  protected showControlsTimer: number | null = null;
  protected resizeObserver?: ResizeObserver;

  get isDraggingProgress(): boolean {
    return this._isDraggingProgress;
  }

  constructor(controller: Controller, plyr: Plyr) {
    this.controller = controller;
    this.plyr = plyr;
    this.ui = this.createUI();
    this.controller.playerContainer.appendChild(this.ui);
    this.initResizeObserver();
    this.bindEvent();
  }

  destory() {
    this.unBindEvent();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }
    this.ui.remove();
  }

  protected initResizeObserver(): void {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 310) {
          this.ui.classList.remove("small");
          this.ui.classList.remove("middle");
        } else if (width < 200) {
          this.ui.classList.add("small");
        } else {
          this.ui.classList.add("middle");
        }
      }
    });
    this.resizeObserver.observe(this.controller.playerContainer);
  }

  public createUI(): HTMLDivElement {
    const ui = document.createElement("div");
    ui.classList.add("custom-plyr-controls");

    this.PlayButton = document.createElement("button");
    this.PlayButton.classList.add("custom-plyr-play-button");

    const layoutProgress = document.createElement("div");
    layoutProgress.classList.add("custom-plyr-layout-progress");

    const layoutTitle = document.createElement("div");
    layoutTitle.classList.add("custom-plyr-layout-title");

    this.Title = document.createElement("span");
    this.Title.classList.add("custom-plyr-title");

    const durationTime = document.createElement("span");
    durationTime.classList.add("custom-plyr-duration-time");
    this.CurrentTime = document.createElement("span");
    this.CurrentTime.classList.add("custom-plyr-current-time");
    const splitTime = document.createElement("span");
    splitTime.classList.add("custom-plyr-split-time");
    splitTime.textContent = "/";
    this.Duration = document.createElement("span");
    this.Duration.classList.add("custom-plyr-duration");
    durationTime.append(this.CurrentTime, splitTime, this.Duration);
    layoutTitle.append(this.Title, durationTime);
    this.ProgressSliderContainer = this.createProgressSliderContainer();
    layoutProgress.append(layoutTitle, this.ProgressSliderContainer);

    const layoutVolume = document.createElement("div");
    layoutVolume.classList.add("custom-plyr-laout-volume-mute-container");
    this.MuteButton = document.createElement("button");
    this.MuteButton.classList.add("custom-plyr-mute-button");
    this.VolumeSliderContainer = this.createVolumeSliderContainer();
    layoutVolume.append(this.MuteButton, this.VolumeSliderContainer);

    ui.append(this.PlayButton, layoutProgress, layoutVolume);
    return ui;
  }

  public init() {
    this.pause(this.plyr.paused);
    this.volume(this.plyr.volume, this.plyr.muted);
    this.currentTime(this.plyr.currentTime, this.plyr.duration);
  }

  protected syncPlay = () => {
    if (!this.controller.context.getIsWritable()) {
      return;
    }
    if (this.PlayButton.classList.contains("playing")) {
      this.controller.pause();
    } else {
      this.controller.play();
    }
    this.hideControls();
  };

  protected syncMute = () => {
    const muted = this.MuteButton.classList.contains("muted");
    this.controller.setMute(!muted);
    this.hideControls();
  };

  protected syncVolume = (num: number) => {
    this.controller.setVolume(num);
    this.hideControls();
  };

  /**
   * 同步播放进度
   * @param seekTime 播放进度, 单位秒
   */
  protected syncSeek = (seekTime: number) => {
    if (!this.controller.context.getIsWritable()) {
      return;
    }
    this.controller.seekTime(seekTime);
  };

  protected eventSeek = (e: PointerEvent) => {
    if (!this.controller.context.getIsWritable()) {
      return;
    }
    const offsetX = e.offsetX;
    const width = this.ProgressSliderContainer.offsetWidth;
    const progress = offsetX / width;
    const seekTime = Math.min(
      Math.max(Math.floor(progress * this.plyr.duration * 1000) / 1000, 0),
      this.plyr.duration
    );
    this.syncSeek(seekTime);
    this.hideControls();
  };

  protected eventVolume = (e: PointerEvent) => {
    const offsetX = e.offsetX;
    const width = this.VolumeSliderContainer.offsetWidth;
    const progress = offsetX / width;
    const volume = Math.min(Math.max(Math.floor(progress * 100) / 100, 0), 1);
    this.syncVolume(volume);
    this.hideControls();
  };

  protected bindDragProgress = (e: PointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    if (!this.controller.context.getIsWritable()) {
      return;
    }
    this._isDraggingProgress = true;
    const offsetX = e.offsetX + this.ProgressSliderButton.offsetLeft;
    this.dragStartX = [e.clientX, offsetX];
    window.addEventListener("pointermove", this.dragProgress);
    window.addEventListener("pointerup", this.dragProgressEnd);
    window.addEventListener("pointercancel", this.dragProgressEnd);
  };
  protected dragProgress = (e: PointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    if (!this.controller.context.getIsWritable()) {
      return;
    }
    if (!this.dragStartX) {
      return;
    }
    const deltaX = e.clientX - this.dragStartX[0];
    const progress = Math.max(
      Math.min((deltaX + this.dragStartX[1]) / this.ProgressSliderContainer.offsetWidth, 1),
      0
    );
    const seekTime = Math.min(
      Math.max(Math.floor(progress * this.plyr.duration * 1000) / 1000, 0),
      this.plyr.duration
    );
    this.currentTime(seekTime, this.plyr.duration);
  };

  protected dragProgressEnd = (e: PointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    if (!this.controller.context.getIsWritable()) {
      return;
    }
    if (!this.dragStartX) {
      return;
    }
    const deltaX = e.clientX - this.dragStartX[0];
    const progress = Math.max(
      Math.min((deltaX + this.dragStartX[1]) / this.ProgressSliderContainer.offsetWidth, 1),
      0
    );
    const seekTime = Math.min(
      Math.max(Math.floor(progress * this.plyr.duration * 1000) / 1000, 0),
      this.plyr.duration
    );
    this.syncSeek(seekTime);
    this._isDraggingProgress = false;
    this.dragStartX = undefined;
    window.removeEventListener("pointermove", this.dragProgress);
    window.removeEventListener("pointerup", this.dragProgressEnd);
    window.removeEventListener("pointercancel", this.dragProgressEnd);
    this.hideControls();
  };

  protected bindDragVolume = (e: PointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    this._isDraggingVolume = true;
    const offsetX = e.offsetX + this.VolumeSliderButton.offsetLeft;
    this.dragStartX = [e.clientX, offsetX];
    window.addEventListener("pointermove", this.dragVolume, { passive: false });
    window.addEventListener("pointerup", this.dragVolumeEnd, { passive: false });
    window.addEventListener("pointercancel", this.dragVolumeEnd, { passive: false });
  };
  protected dragVolume = (e: PointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    if (!this.dragStartX) {
      return;
    }
    const deltaX = e.clientX - this.dragStartX[0];
    const progress = Math.max(
      Math.min((deltaX + this.dragStartX[1]) / this.VolumeSliderContainer.offsetWidth, 1),
      0
    );
    const volume = Math.floor(progress * 100) / 100;
    this.volume(volume);
  };

  protected dragVolumeEnd = (e: PointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    if (!this.dragStartX) {
      return;
    }
    const deltaX = e.clientX - this.dragStartX[0];
    const progress = Math.max(
      Math.min((deltaX + this.dragStartX[1]) / this.VolumeSliderContainer.offsetWidth, 1),
      0
    );
    const volume = Math.floor(progress * 100) / 100;
    this.syncVolume(volume);
    this._isDraggingVolume = false;
    this.dragStartX = undefined;
    window.removeEventListener("pointermove", this.dragVolume);
    window.removeEventListener("pointerup", this.dragVolumeEnd);
    window.removeEventListener("pointercancel", this.dragVolumeEnd);
    this.hideControls();
  };

  protected bindEvent(): void {
    this.PlayButton.addEventListener("click", this.syncPlay);
    this.MuteButton.addEventListener("click", this.syncMute);
    this.ProgressSliderContainer.addEventListener("pointerup", this.eventSeek);
    this.VolumeSliderContainer.addEventListener("pointerup", this.eventVolume);
    this.ProgressSliderButton.addEventListener("pointerdown", this.bindDragProgress, {
      capture: true,
      passive: false,
    });
    this.VolumeSliderButton.addEventListener("pointerdown", this.bindDragVolume, {
      capture: true,
      passive: false,
    });
    this.controller.playerContainer.addEventListener("mouseenter", this.handleMouseEnter);
    this.controller.playerContainer.addEventListener("mouseleave", this.handleMouseLeave);
    this.controller.playerContainer.addEventListener("touchstart", this.handleTouchStart);
    this.ui.addEventListener("touchstart", this.stopPropagationFun);
  }

  protected stopPropagationFun = (e: TouchEvent | MouseEvent) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  protected handleTouchStart = (e: TouchEvent) => {
    this.stopPropagationFun(e);
    this.ui.classList.toggle("active", true);
    this.hideControls();
  }

  protected handleMouseEnter = () => {
    this.ui.classList.toggle("hover", true);
  }

  protected handleMouseLeave = () => {
    this.hideControls(0);
  }

  protected hideControls = (timeout: number=3000) => {
    if (this.showControlsTimer) {
      clearTimeout(this.showControlsTimer);
      this.showControlsTimer = null;
    }
    this.showControlsTimer = setTimeout(() => {
      this.showControlsTimer = null;
      this.ui.classList.toggle("active", false);
      if (this.controller.player && this.controller.player.paused) {
        this.ui.classList.toggle("hover", true);
        return;
      }
      this.ui.classList.toggle("hover", false);
    }, timeout);
  }

  protected unBindEvent() {
    this.PlayButton.removeEventListener("click", this.syncPlay);
    this.MuteButton.removeEventListener("click", this.syncMute);
    this.ProgressSliderContainer.removeEventListener("pointerup", this.eventSeek);
    this.VolumeSliderContainer.removeEventListener("pointerup", this.eventVolume);
    this.ProgressSliderButton.removeEventListener("pointerdown", this.bindDragProgress);
    this.VolumeSliderButton.removeEventListener("pointerdown", this.bindDragVolume);
    this.controller.playerContainer.removeEventListener("touchstart", this.handleTouchStart);
    this.controller.playerContainer.removeEventListener("mouseenter", this.handleMouseEnter);
    this.controller.playerContainer.removeEventListener("mouseleave", this.handleMouseLeave);
    this.ui.removeEventListener("touchstart", this.stopPropagationFun);
  }

  protected createVolumeSliderContainer(): HTMLDivElement {
    const VolumeSliderContainer = document.createElement("div");
    VolumeSliderContainer.classList.add("custom-plyr-volume-slider-container");

    this.VolumeSlider = document.createElement("div");
    this.VolumeSlider.classList.add("custom-plyr-volume-slider");

    this.VolumeSliderButton = document.createElement("button");
    this.VolumeSliderButton.classList.add("custom-plyr-volume-slider-button");

    VolumeSliderContainer.append(this.VolumeSlider, this.VolumeSliderButton);
    return VolumeSliderContainer;
  }

  protected createProgressSliderContainer(): HTMLDivElement {
    const progressSliderUI = document.createElement("div");
    progressSliderUI.classList.add("custom-plyr-progress-slider-container");

    this.ProgressSlider = document.createElement("div");
    this.ProgressSlider.classList.add("custom-plyr-progress-slider");

    this.ProgressSliderButton = document.createElement("button");
    this.ProgressSliderButton.classList.add("custom-plyr-progress-slider-button");

    progressSliderUI.append(this.ProgressSlider, this.ProgressSliderButton);
    return progressSliderUI;
  }

  public volume(volume: number, muted?: boolean): void {
    if (isBoolean(muted)) {
      this.MuteButton.classList.toggle("muted", muted);
    }
    if (muted) {
      this.VolumeSlider.style.width = `0%`;
      this.VolumeSliderButton.style.left = `0%`;
    } else {
      this.VolumeSlider.style.width = `${Math.floor(volume * 100)}%`;
      this.VolumeSliderButton.style.left = `${Math.floor(volume * 100)}%`;
    }
  }

  public pause(pause: boolean, forceShowControls?: boolean): void {
    this.PlayButton.classList.toggle("playing", !pause);
    if (forceShowControls) {
      if(this.showControlsTimer) {
        clearTimeout(this.showControlsTimer);
        this.showControlsTimer = null;
      }
      this.ui.classList.toggle("hover", true);
    }
  }

  protected formatTime(time: number): string {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    } else {
      return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
  }

  /**
   * 设置播控组件上的播放进度和总时间显示
   * @param currentTime 当前时间, 单位秒
   * @param duration 总时间, 单位秒
   */
  public currentTime(currentTime: number, duration: number): void {
    const currentTimeString = this.formatTime(currentTime);
    const durationString = this.formatTime(duration);
    this.CurrentTime.textContent = currentTimeString;
    this.Duration.textContent = durationString;
    const progress = Math.floor((currentTime / duration) * 100);
    this.ProgressSlider.style.width = `${progress}%`;
    this.ProgressSliderButton.style.left = `${progress}%`;
  }

  public title(title: string): void {
    this.Title.textContent = title;
  }
  
}
