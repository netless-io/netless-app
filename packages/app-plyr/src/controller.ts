import type { Attributes } from ".";
import Plyr, { Provider } from "plyr";
import { cannotPlayHLSNatively, guessTypeFromSrc, hlsTypes, loadHLS } from "./utils";
import { debounce, isBoolean, isEqual, isNumber } from "lodash";
import { AppContext, Player, Room } from "@netless/window-manager";

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
  private forceSyncOperation: Set<PlayerOperationType> = new Set();
  /** 不需要同步的进度时间, 默认seek都同步 */
  private notSyncSeekTimeSet: Set<number> = new Set();
  private timeIntervaler = 0;
  private syncPromeResolveMap: Map<
    number,
    {
      count: number;
      timer: number | null;
      resolve: () => void;
    }
  > = new Map();
  private controlDomResolve: {
    timer: number | null;
    resolve: () => void;
  } | null = null;
  readonly context: AppContext<Attributes>;
  public readonly playerContainer!: HTMLAudioElement | HTMLVideoElement | HTMLDivElement;
  private pcmAudioSource: MediaElementAudioSourceNode | undefined;
  public customControls?: CustomPlyrControls;
  private lastSyncState: Partial<Pick<Attributes, "volume" | "muted" | "playTimeState">> = {};

  public constructor(context: AppContext<Attributes>) {
    this.context = context;
    const { src, provider, type, poster } = this.context.storage.state;
    const _type = provider ? undefined : type || guessTypeFromSrc(src);
    this.playerContainer = this.createPlayerContainer({ src, poster, provider, type: _type });
    // (window as any).plyrController = this;
  }
  private connectToPcmProxyIfPossible = (element: HTMLElement) => {
    const pcmProxy = (window as any).__pcmProxy;
    if (pcmProxy) {
      if (element instanceof HTMLVideoElement || element instanceof HTMLAudioElement) {
        console.log("[Plyr] connect pcm");
        this.pcmAudioSource = pcmProxy.connect?.(element);
      }
    }
  };
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

  get playTimeState(): PlayTimeState | undefined {
    return this.context.storage.state.playTimeState || undefined;
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

  private hasPermission = (_operation: PlayerOperationType): PermissionType => {
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

  private attrsUpdateHandler = debounce(() => {
    if (!this.player) {
      return;
    }
    if (!this.player.elements) {
      return;
    }
    console.log(
      "[app plyr] attrsUpdateHandler",
      this.player.volume,
      this.volumeData,
      this.player.muted,
      this.mutedData,
      this.playTimeState
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
      console.log("[app plyr] attrsUpdateHandler willUpdateAttr", willUpdateAttr);
      this.willSyncPlayerState(willUpdateAttr);
    }
  }, 50);

  private syncPlayTimeState = (progressTime: number) => {
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

  private resovleTimer = (key: number) => {
    return window.setTimeout(() => {
      this.syncPlayTimeState(key);
    }, 100);
  };

  private willSyncPlayerState = async (target: {
    volume?: number;
    muted?: boolean;
    playTimeState?: PlayTimeState;
  }) => {
    if (this.player) {
      const { volume, muted, playTimeState } = target;
      console.log("[app plyr] willSyncPlayerState", volume, muted, playTimeState);
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
          console.log("[app plyr] willSyncPlayerState safePause");
          this.safePause();
          if (this.customControls) {
            this.customControls.pause(playTimeState[0]);
          }
        }
        if (!playTimeState[0]) {
          await this.safePlay();
          if (this.customControls) {
            this.customControls.pause(this.player.paused);
          }
        }
      }
    }
  };

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
      console.error("[app plyr] play error loop overflow", loop);
      return;
    }
    console.log("[app plyr] play error safePlay start");
    try {
      loop++;
      if (this.player.paused) {
        await this.player.play();
      }
    } catch (error) {
      console.error("[app plyr] play error", error);
      if (this.player) {
        this.player.muted = true;
        if (this.customControls) {
          this.customControls.volume(this.player.volume, true);
        }
        await this.safePlay(loop);
        console.log("[app plyr] play error safePlay end");
      }
    }
  };

  private createYoutubeContainer(src: string, poster?: string): HTMLDivElement {
    const container = document.createElement("div");
    container.classList.add("plyr__video-embed");
    container.setAttribute("data-app-kind", "Plyr");
    container.setAttribute("data-plyr-provider", "youtube");
    container.setAttribute("data-plyr-embed-id", src);
    poster && container.setAttribute("data-poster", poster);
    return container;
  }

  private createVimeoContainer(src: string, poster?: string): HTMLDivElement {
    const container = document.createElement("div");
    container.classList.add("plyr__video-embed");
    container.setAttribute("data-app-kind", "Plyr");
    container.setAttribute("data-plyr-provider", "vimeo");
    container.setAttribute("data-plyr-embed-id", src);
    poster && container.setAttribute("data-poster", poster);
    return container;
  }

  private createAudioContainer(src: string, type: string, poster?: string): HTMLAudioElement {
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

  private createVideoContainer(src: string, type: string, poster?: string): HTMLVideoElement {
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

  private createPlayerContainer(option: {
    src: string;
    poster?: string;
    provider?: Provider;
    type?: string;
  }): HTMLAudioElement | HTMLVideoElement | HTMLDivElement {
    const { src, poster, provider, type } = option;
    if (provider === "youtube") {
      return this.createYoutubeContainer(src, poster);
    } else if (provider === "vimeo") {
      return this.createVimeoContainer(src, poster);
    }
    if (type) {
      if (type.startsWith("audio/")) {
        return this.createAudioContainer(src, type, poster);
      } else {
        return this.createVideoContainer(src, type, poster);
      }
    } else {
      const container = document.createElement("div");
      container.classList.add("plyr--audio");
      container.setAttribute("data-app-kind", "Plyr");
      container.innerText = `Invalid "src" or "type". ${JSON.stringify({ src, type })}`;
      return container;
    }
  }

  public async mountPlayer(): Promise<void> {
    const { src, provider, type, paused, customControlsTitle, syncMuted, syncVolume } =
      this.context.storage.state;
    const _type = provider ? undefined : type || guessTypeFromSrc(src);
    this.connectToPcmProxyIfPossible(this.playerContainer);
    const useHLS = hlsTypes.includes(String(_type).toLowerCase());
    this.cancleCalibrationProgressTime();
    const isAutoPlay = !paused;
    if (this.playerContainer) {
      if (useHLS && cannotPlayHLSNatively(this.playerContainer)) {
        const hls = await loadHLS();
        hls.loadSource(src);
        hls.attachMedia(this.playerContainer);
      }
      this.player = new Plyr(this.playerContainer, {
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
      if (this.player) {
        if (this.useCustomControls) {
          this.customControls = new CustomPlyrControls(this, this.player);
          this.customControls.title(customControlsTitle || "");
        }
        this.player.on("ended", () => {
          if (this.player) {
            const currentTime = this.player.currentTime;
            console.log("[app plyr] ended, currentTime:", currentTime);
            this.player?.pause();
            if (this.customControls) {
              this.customControls.pause(true);
            }
            this.cancleCalibrationProgressTime();
          }
        });
        this.player.on("ready", () => {
          if (this.player) {
            if (this.customControls) {
              this.customControls.init();
            }
            this.attrsUpdateHandler();
            this.context.storage.addStateChangedListener(this.attrsUpdateHandler);
          }
          // window.mediaPlayer = this.player;
          console.log("[app plyr] ready, buffered:", this.player?.buffered);
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
            console.log("[app plyr] seeked, seeking:", this.player?.seeking);
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
            console.log("[app plyr] play, paused:", this.player?.paused);
            this.calibrationProgressTime();
          }
        });
        this.player.on("pause", () => {
          if (this.player) {
            const playPermission = this.hasPermission("play");
            if (playPermission === "sync" && this.forceSyncOperation.has("play")) {
              console.log("[app plyr] pause by sync, paused:", this.player?.paused);
              this.willActiveUpdatePlayTimeState();
            }
            this.forceSyncOperation.delete("play");
            console.log("[app plyr] pause, paused:", this.player?.paused);
            this.cancleCalibrationProgressTime();
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
              "[app plyr] volumechange, volume:",
              this.player?.volume,
              "muted:",
              this.player?.muted
            );
          }
        });
        await this.setControlPermission();
        (window as any).__plyr = this.player;
        if (!this.pcmAudioSource) {
          const media = (this.player as any).media;
          if (media) {
            this.connectToPcmProxyIfPossible(media);
          }
        }
      }
    }
  }

  private initControlDol = () => {
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

  private controlDomTimeClock = () => {
    return setTimeout(() => {
      if (this.controlDomResolve && this.controlDomResolve.timer) {
        this.controlDomResolve.timer = null;
      }
      this.initControlDol();
    }, 100) as unknown as number;
  };

  private activeControlDom = (operation: PlayerOperationType) => {
    this.forceSyncOperation.add(operation);
    console.log("[app plyr] activeControlDom", operation);
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
      console.log("[app plyr] playControlDom", !!playControlDom);
      if (playControlDom) {
        playControlDom.addEventListener("pointerdown", e => {
          console.log("[app plyr] playControlDom pointerdown", e.target);
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

  private calibrationProgressTime = (): void => {
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
            // console.log("calibrationProgressTime==>1", progressTime - this.player.currentTime, this.player.speed, progressTime, this.player.currentTime);
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

  private cancleCalibrationProgressTime = (): void => {
    if (this.timeIntervaler) {
      clearInterval(this.timeIntervaler);
    }
    if (this.player) {
      this.player.speed = 1;
    }
  };

  private willActiveUpdatePlayTimeState = debounce(() => {
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

  private setVolumeData(volume: number): void {
    console.log("[app plyr] setVolumeData", volume);
    this.context.storage.setState({ volume });
  }

  public setMutedData(muted: boolean): void {
    console.log("[app plyr] setMutedData", muted);
    this.context.storage.setState({ muted });
  }

  private setPlayTimeStateData(playTimeState: PlayTimeState): void {
    console.log("[app plyr] setPlayTimeStateData", playTimeState);
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
        const seekTime = this.player?.currentTime || 0;
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

  public async destroy(): Promise<void> {
    if (this.player) {
      this.cancleCalibrationProgressTime();
      await new Promise<void>(resolve => {
        setTimeout(() => {
          resolve();
        }, 500);
      });
      this.player?.destroy();
      this.pcmAudioSource?.disconnect();
      this.pcmAudioSource = undefined;
      this.player = undefined;
      this.playerContainer.innerHTML = "";
      if (this.customControls) {
        this.customControls.destory();
        this.customControls = undefined;
      }
    }
  }
}

export class CustomPlyrControls {
  private controller: Controller;
  private plyr: Plyr;
  public readonly ui: HTMLDivElement;
  private PlayButton!: HTMLButtonElement;
  private MuteButton!: HTMLButtonElement;
  private VolumeSliderContainer!: HTMLDivElement;
  private VolumeSlider!: HTMLDivElement;
  private VolumeSliderButton!: HTMLButtonElement;
  private CurrentTime!: HTMLSpanElement;
  private Duration!: HTMLSpanElement;
  private ProgressSliderContainer!: HTMLDivElement;
  private ProgressSlider!: HTMLDivElement;
  private ProgressSliderButton!: HTMLButtonElement;
  private Title!: HTMLSpanElement;
  private _isDraggingVolume = false;
  private _isDraggingProgress = false;
  private dragStartX?: [number, number];

  get isDraggingProgress(): boolean {
    return this._isDraggingProgress;
  }

  constructor(controller: Controller, plyr: Plyr) {
    this.controller = controller;
    this.plyr = plyr;
    this.ui = this.createUI();
    this.bindEvent();
  }

  destory() {
    this.unBindEvent();
    this.ui.remove();
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

  private syncPlay = () => {
    if (this.PlayButton.classList.contains("playing")) {
      this.controller.pause();
    } else {
      this.controller.play();
    }
  };

  private syncMute = () => {
    const muted = this.MuteButton.classList.contains("muted");
    this.controller.setMute(!muted);
  };

  private syncVolume = (num: number) => {
    this.controller.setVolume(num);
  };

  /**
   * 同步播放进度
   * @param seekTime 播放进度, 单位秒
   */
  private syncSeek = (seekTime: number) => {
    this.controller.seekTime(seekTime);
  };

  private eventSeek = (e: PointerEvent) => {
    const offsetX = e.offsetX;
    const width = this.ProgressSliderContainer.offsetWidth;
    const progress = offsetX / width;
    const seekTime = Math.min(
      Math.max(Math.floor(progress * this.plyr.duration * 1000) / 1000, 0),
      this.plyr.duration
    );
    this.syncSeek(seekTime);
  };

  private eventVolume = (e: PointerEvent) => {
    const offsetX = e.offsetX;
    const width = this.VolumeSliderContainer.offsetWidth;
    const progress = offsetX / width;
    const volume = Math.min(Math.max(Math.floor(progress * 100) / 100, 0), 1);
    this.syncVolume(volume);
  };

  private bindDragProgress = (e: PointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
    }
    this._isDraggingProgress = true;
    const offsetX = e.offsetX + this.ProgressSliderButton.offsetLeft;
    this.dragStartX = [e.clientX, offsetX];
    window.addEventListener("pointermove", this.dragProgress, { passive: false });
    window.addEventListener("pointerup", this.dragProgressEnd, { passive: false });
    window.addEventListener("pointercancel", this.dragProgressEnd, { passive: false });
  };
  private dragProgress = (e: PointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
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

  private dragProgressEnd = (e: PointerEvent) => {
    e.stopPropagation();
    if (e.cancelable) {
      e.preventDefault();
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
  };

  private bindDragVolume = (e: PointerEvent) => {
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
  private dragVolume = (e: PointerEvent) => {
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

  private dragVolumeEnd = (e: PointerEvent) => {
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
  };

  private bindEvent(): void {
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
  }

  private unBindEvent() {
    this.PlayButton.removeEventListener("click", this.syncPlay);
    this.MuteButton.removeEventListener("click", this.syncMute);
    this.ProgressSliderContainer.removeEventListener("pointerup", this.eventSeek);
    this.VolumeSliderContainer.removeEventListener("pointerup", this.eventVolume);
    this.ProgressSliderButton.removeEventListener("pointerdown", this.bindDragProgress);
    this.VolumeSliderButton.removeEventListener("pointerdown", this.bindDragVolume);
  }

  private createVolumeSliderContainer(): HTMLDivElement {
    const VolumeSliderContainer = document.createElement("div");
    VolumeSliderContainer.classList.add("custom-plyr-volume-slider-container");

    this.VolumeSlider = document.createElement("div");
    this.VolumeSlider.classList.add("custom-plyr-volume-slider");

    this.VolumeSliderButton = document.createElement("button");
    this.VolumeSliderButton.classList.add("custom-plyr-volume-slider-button");

    VolumeSliderContainer.append(this.VolumeSlider, this.VolumeSliderButton);
    return VolumeSliderContainer;
  }

  private createProgressSliderContainer(): HTMLDivElement {
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

  public pause(pause: boolean): void {
    this.PlayButton.classList.toggle("playing", !pause);
  }

  private formatTime(time: number): string {
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
