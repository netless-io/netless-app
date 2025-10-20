import type { Attributes } from ".";
import Plyr, { Provider } from 'plyr';
import { cannotPlayHLSNatively, guessTypeFromSrc, hlsTypes, loadHLS } from './utils';
import { debounce, isBoolean, isNumber } from 'lodash';
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
export type PlayerOperationType = 'play' | 'seek' | 'volume' | 'muted';

/**
 * 权限类型
 * - sync: 同步权限
 * - local: 本地权限
 * - none: 无权限
 */
export type PermissionType = 'sync' | 'local' | 'none';

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
  private timeIntervaler: number = 0;
  private syncPromeResolveMap: Map<number, {
        count: number;
        timer: number | null;   
        resolve: () => void;
    }> = new Map();
  private controlDomResolve: {
        timer: number | null;
        resolve: () => void;
    } | null = null;
  readonly context: AppContext<Attributes>;
  public readonly playerContainer!: HTMLAudioElement | HTMLVideoElement | HTMLDivElement;
  private pcmAudioSource: MediaElementAudioSourceNode | undefined;

  public constructor(context: AppContext<Attributes>) {
    this.context = context;
    const { src, provider, type, paused, poster } = this.context.storage.state;
    const _type = provider ? undefined : type || guessTypeFromSrc(src);
    this.playerContainer = this.createPlayerContainer({ src, poster, provider, type: _type });
    (window as any).plyrController = this;
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
    : this.displayer ? this.displayer.beginTimestamp + this.displayer?.progressTime : 0;
  }

  get playTimeState(): PlayTimeState | undefined {
    return this.context.storage.state.playTimeState || undefined;
  }

  /**
   * 暂停状态
   * - [true, number]: 暂停状态, 播放器进度时间
   * - false: 未暂停状态
   */
  get pausedState(): [true, number] | false {
    const playTimeState = this.playTimeState;
    if ( playTimeState && playTimeState[0]) {
      return [playTimeState[0], playTimeState[2] - playTimeState[1]];
    }
    return false;
  }

  /**
   * 播放器进度时长,单位毫秒
   */
  get progressTime(): number {
    if (this.playTimeState) {
      if (this.pausedState === false) {
        return this.calibrationTimestamp - this.playTimeState[1];
      }
      return this.pausedState[1];
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
    return this.player?.duration || 0;
  }

  private hasPermission = (_operation: PlayerOperationType):PermissionType => {
    // todo 如果客户需要更细粒度的权限控制，可以在这里添加
    if (this.context.getIsWritable()) {
      return 'sync';
    }
    return 'none';
  };

  private attrsUpdateHandler = debounce(() => {
    if (!this.player) {
      return;
    }
    if (!this.player.elements ) {
      return;
    }
    console.log('[app plyr] attrsUpdateHandler', this.player.volume, this.volumeData, this.player.muted, this.mutedData, this.playTimeState);
    const willUpdateAttr: {
        volume?: number;
        muted?: boolean;
        playTimeState?: PlayTimeState;
    } = {};
    if (this.player.volume !== this.volumeData) {
      willUpdateAttr.volume = this.volumeData;
    }
    if (this.player.muted !== this.mutedData) {
      willUpdateAttr.muted = this.mutedData;
    }
    const playTimeState = this.playTimeState;
    if (playTimeState) {
      if ( playTimeState[0] !== this.player.paused ) {
        willUpdateAttr.playTimeState = playTimeState;
      }
      if (Math.abs(this.progressTime - this.player.currentTime * 1000) > 1000) {
        willUpdateAttr.playTimeState = playTimeState;
      }
    }
    if (Object.keys(willUpdateAttr).length > 0) {
      console.log('[app plyr] attrsUpdateHandler willUpdateAttr', willUpdateAttr);
      this.willSyncPlayerState(willUpdateAttr);
    }
  }, 50);

  private resovleTimer = (key: number) => {
    return window.setTimeout(() => {
      const _resovle = this.syncPromeResolveMap.get(key);
      if (_resovle) {
        const buffered = this.player?.buffered ?? undefined;
        if (buffered || _resovle.count > 20) {
          _resovle.resolve();
          if (_resovle.timer) {
            window.clearTimeout(_resovle.timer);
            _resovle.timer = null;
          }
        } else {
          _resovle.count++;
          _resovle.timer = this.resovleTimer(key);
        }
      }
    }, 100);
  };

  private willSyncPlayerState = async (target: {
        volume?: number;
        muted?: boolean;
        playTimeState?: PlayTimeState;
    }) => {
    if (this.player) {
      const { volume, muted, playTimeState } = target;
      console.log('[app plyr] willSyncPlayerState', volume, muted, playTimeState);
      if (isNumber(volume)) {
        // this.notSyncOperation.add('volume');
        this.player.volume = volume;
      }
      if (isBoolean(muted)) {
        // this.notSyncOperation.add('muted');
        this.player.muted = muted;
      }
      if (playTimeState) {
        const progressTime = this.progressTime / 1000;
        if (Math.abs(progressTime - this.player.currentTime) > 1) {
          const resovle = this.syncPromeResolveMap.get(progressTime);
          if (resovle) {
            if (resovle.timer) {
              window.clearTimeout(resovle.timer);
            }
            this.syncPromeResolveMap.delete(progressTime);
          }
          new Promise<void>((resolve) => {
            this.syncPromeResolveMap.set(progressTime, {
              count: 0,
              timer: this.resovleTimer(progressTime),
              resolve,
            });
          }).then(()=>{
            if (this.player) {
              const _progressTime = this.progressTime / 1000;
              this.notSyncSeekTimeSet.add(Math.round(_progressTime));
              this.player.currentTime = _progressTime;
            }
            this.syncPromeResolveMap.delete(progressTime);
          });
        }
        if (this.player.paused !== playTimeState[0]) {
          if (playTimeState[0]) {
            this.player.pause();
          } else {
            this.safePlay(true); 
          }
        }
      }
    }
  };

  private safePlay = async (notSyncOperation: boolean = false, loop: number = 0) => {
    if (!this.player) {
      return;
    }
    if (loop > 3) {
      console.error('[app plyr] play error loop overflow', loop);
      return;
    }
    console.log('[app plyr] play error safePlay start');
    try {
      loop++;
      await this.player.play();
      // this.checkPlayMuted();
    } catch (error) {
      console.error('[app plyr] play error', error);
      if (this.player) {
        this.player.muted = true;
        await this.safePlay(notSyncOperation, loop);
        console.log('[app plyr] play error safePlay end');
      }
    }
  }

  // private checkPlayMuted = () => {
  //   setTimeout(async () => {
  //     if (!this.player) {
  //       return;
  //     }
  //     if (this.player.muted !== this.mutedData) {
  //       const mutedDom = this.player.elements.container?.querySelector('.plyr__volume button') as HTMLButtonElement;
  //       // mutedDom.click();
  //       // try {
  //       //   const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  //       //   console.log("设备权限已获取，自动播放限制可能已解除");
  //       //   stream.getTracks().forEach(track => track.stop());
  //       // } catch (error) {
  //       //   console.log("权限请求失败", error);
  //       // }
  //       // 在页面初始化时，尝试请求用户媒体权限
        
  //       // .then(function(stream) {
  //       //   // 权限获取成功！此时浏览器的自动播放策略可能会放宽
  //       //   console.log("设备权限已获取，自动播放限制可能已解除");
          
  //       //   // 注意：这里我们并不真正使用这个stream，目的是获取权限
  //       //   // 关闭获取到的媒体轨道
  //       //   stream.getTracks().forEach(track => track.stop());
          
  //       //   // 现在尝试播放你的背景音乐
  //       //   const audio = new Audio('your-audio.mp3');
  //       //   audio.play().catch(e => console.error("最终还是失败了:", e));
  //       // })
  //       // .catch(function(err) {
  //       //   // 用户拒绝了权限请求或发生错误，自动播放依然会被阻止
  //       //   console.log("权限请求失败", err);
  //       //   // 此时需要降级到方案一，引导用户交互
  //       // });

  //       // mutedDom.addEventListener('pointerdown', (e)=>{
  //       //   console.log('[app plyr] checkPlayMuted pointerdown===>', e);
  //       // });
  //       // mutedDom.click();
  //       // 模拟一个pointerdown事件
  //       // const pointerdownEvent = new PointerEvent('pointerdown', {
  //       //   bubbles: true,
  //       //   cancelable: true,
  //       //   composed: true,
  //       // });
  //       // console.log('[app plyr] checkPlayMuted====>', mutedDom, pointerdownEvent);
  //       // mutedDom.dispatchEvent(pointerdownEvent);
  //     }
  //   }, 1000);
  // }

  private createYoutubeContainer(src: string, poster?: string): HTMLDivElement {
    const container = document.createElement('div');
    container.classList.add('plyr__video-embed');
    container.setAttribute('data-app-kind', 'Plyr');
    container.setAttribute('data-plyr-provider', 'youtube');
    container.setAttribute('data-plyr-embed-id', src);
    poster && container.setAttribute('data-poster', poster);
    return container;
  }

  private createVimeoContainer(src: string, poster?: string): HTMLDivElement {
    const container = document.createElement('div');
    container.classList.add('plyr__video-embed');
    container.setAttribute('data-app-kind', 'Plyr');
    container.setAttribute('data-plyr-provider', 'vimeo');
    container.setAttribute('data-plyr-embed-id', src);
    poster && container.setAttribute('data-poster', poster);
    return container;
  }

  private createAudioContainer(src: string, type: string, poster?: string): HTMLAudioElement {
    const container = document.createElement('audio');
    container.setAttribute('data-app-kind', 'Plyr');
    container.setAttribute('crossorigin', 'anonymous');
    poster && container.setAttribute('data-poster', poster);
    const source =  document.createElement('source');
    source.setAttribute('src', src);
    source.setAttribute('type', type);
    container.appendChild(source);
    return container;
  }

  private createVideoContainer(src: string, type: string, poster?: string): HTMLVideoElement {
    const container = document.createElement('video');
    container.setAttribute('data-app-kind', 'Plyr');
    container.setAttribute('crossorigin', 'anonymous');
    container.setAttribute('playsinline', 'true');
    poster && container.setAttribute('data-poster', poster);
    const source =  document.createElement('source');
    source.setAttribute('src', src);
    source.setAttribute('type', type);
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
    if (provider === 'youtube') {
      return this.createYoutubeContainer(src, poster);
    } else if (provider === 'vimeo') {
      return this.createVimeoContainer(src, poster);
    }
    if (type) {
      if (type.startsWith('audio/')) {
        return this.createAudioContainer(src, type, poster);
      } else {
        return this.createVideoContainer(src, type, poster);
      }
    } else {
      const container = document.createElement('div');
      container.classList.add('plyr--audio');
      container.setAttribute('data-app-kind', 'Plyr');
      container.innerText = `Invalid "src" or "type". ${JSON.stringify({ src, type })}`;
      return container;
    }
  }

  public async mountPlayer(): Promise<void> {
    const { src, provider, type, paused } = this.context.storage.state;
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
        controls: ['play', 'progress', 'current-time', 'mute', 'volume'],
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
        this.player.on('ended', () => {
          if (this.player) {
            const currentTime = this.player.currentTime;
            console.log('[app plyr] ended, currentTime:', currentTime);
            this.player?.pause();
            this.cancleCalibrationProgressTime();
          }
        });
        this.player.on('ready', () => {
          if (this.player) {
            this.attrsUpdateHandler();
            this.context.storage.addStateChangedListener(this.attrsUpdateHandler);
          }
          // @ts-ignore
          window.mediaPlayer = this.player;
          // this.context.emitter.emit('playerStatusChange', 'ready');
          console.log('[app plyr] ready, buffered:', this.player?.buffered);
        });
        // this.player.on('waiting', () => {
        //   // this.context.emitter.emit('playerStatusChange', 'waiting');
        //   console.log('[app plyr] waiting, buffered:', this.player?.buffered);
        // });
        // this.player.on('playing', () => {
        //   // this.context.emitter.emit('playerStatusChange', 'playing');
        //   console.log('[app plyr] playing, playing:', this.player?.playing);
        // });
        // this.player.on('seeking', () => {
        //   if (this.player && !this.notSyncSeekTimeSet.has(Math.round(this.player.currentTime))) {
        //     // this.context.emitter.emit('playerStatusChange', 'seeking');
        //     console.log('[app plyr] seeking, seeking:', this.player?.seeking);
        //   }
        // });
        this.player.on('seeked', () => {
          if (this.player) {
            const key = Math.round(this.player.currentTime);
            const playPermission = this.hasPermission('seek');
            if (playPermission === 'sync' && !this.notSyncSeekTimeSet.has(key)) {
              if (Math.abs(this.player.currentTime - this.progressTime / 1000) > 1) {
                this.willActiveUpdatePlayTimeState();
              }
            }
            if(this.notSyncSeekTimeSet.has(key)){
              this.notSyncSeekTimeSet.delete(key);
            }
            console.log('[app plyr] seeked, seeking:', this.player?.seeking);
          }
                    
        });
        this.player.on('play', () => {
          if (this.player) {
            const playPermission = this.hasPermission('play');
            if (playPermission === 'sync') {
              if (this.forceSyncOperation.has('play')) {
                this.willActiveUpdatePlayTimeState();
              } else if (isAutoPlay && !this.player.paused && !this.playTimeState) {
                this.willActiveUpdatePlayTimeState();
              }
            }
            this.forceSyncOperation.delete('play');
            // this.context.emitter.emit('playerStatusChange', 'play');
            console.log('[app plyr] play, paused:', this.player?.paused);
            this.calibrationProgressTime();
          }
        });
        this.player.on('pause', () => {
          if (this.player) {
            const playPermission = this.hasPermission('play');
            if (playPermission === 'sync' && this.forceSyncOperation.has('play')) {
              console.log('[app plyr] pause 0000, paused:', this.player?.paused);
              this.willActiveUpdatePlayTimeState();
            }
            this.forceSyncOperation.delete('play');
            console.log('[app plyr] pause, paused:', this.player?.paused);
            // this.context.emitter.emit('playerStatusChange', 'pause');
            this.cancleCalibrationProgressTime();
          }
        });
        this.player.on('timeupdate', () => {
          // console.log('[app plyr] timeupdate, currentTime:', this.player?.currentTime);
          // this.context.emitter.emit('playerStatusChange', 'timeupdate');
        });
        this.player.on('volumechange', () => {
          if(this.player) {
            const volumePermission = this.hasPermission('volume');
            const mutePermission = this.hasPermission('muted');
            if ((volumePermission === 'sync' || mutePermission === 'sync')) {
              if (volumePermission === 'sync' && this.forceSyncOperation.has('volume')) {
                this.setVolumeData(this.player.volume);
              }
              if (mutePermission === 'sync' && this.forceSyncOperation.has('muted')) {
                this.setMutedData(this.player.muted);
              }
            }
            this.forceSyncOperation.delete('volume');
            this.forceSyncOperation.delete('muted');
            console.log('[app plyr] volumechange, volume:', this.player?.volume, 'muted:', this.player?.muted);
            // this.context.emitter.emit('playerStatusChange', 'volumechange');
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
        const controlsDom = this.player.elements.container.querySelector('.plyr__controls') as HTMLDivElement;
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
        this.controlDomResolve.timer =  null;
      }
      this.initControlDol();
    }, 100) as unknown as number;
  };

  private activeControlDom = (operation: PlayerOperationType) => {
    this.forceSyncOperation.add(operation);
    console.log('[app plyr] activeControlDom', operation);
  }

  public async setControlPermission() {
    if (this.player && (!this.player.elements || !this.player.elements.container || !this.player.elements.container.querySelector('.plyr__controls'))) {
      await new Promise<void>((resolve) => {
        this.controlDomResolve = {
          timer: this.controlDomTimeClock(),
          resolve,
        };
      });
    }
    if (this.player && this.player.elements && this.player.elements.container) {
      const controlsDom = this.player.elements.container.querySelector('.plyr__controls') as HTMLDivElement;
      if (controlsDom && controlsDom.style.pointerEvents === 'none') {
        controlsDom.style.pointerEvents = '';
      }
      const volumeControlDom = this.player.elements.container.querySelector('.plyr__volume') as HTMLInputElement;
      if (volumeControlDom && volumeControlDom.style.pointerEvents === 'none') {
        volumeControlDom.style.pointerEvents = '';
      }
      const volumeDom = this.player.elements.container.querySelector('.plyr__volume input') as HTMLInputElement;
      if (volumeDom && volumeDom.style.pointerEvents === 'auto') {
        volumeDom.style.pointerEvents = '';
      }
      const mutedDom = this.player.elements.container.querySelector('.plyr__volume button') as HTMLButtonElement;
      if (mutedDom && mutedDom.style.pointerEvents === 'auto') {
        mutedDom.style.pointerEvents = '';
      }
      const playControlDom = controlsDom.querySelector('button.plyr__control') as HTMLButtonElement;
      console.log('[app plyr] playControlDom', !!playControlDom);
      playControlDom.addEventListener('pointerdown', (e)=>{
        console.log('[app plyr] playControlDom pointerdown', e.target);
        this.activeControlDom('play');
      });
      const playPermission = this.hasPermission('play');
      const volumePermission = this.hasPermission('volume');
      const mutedPermission = this.hasPermission('muted');

      // 如果播放权限为非同步，且音量权限和静音权限为无权限，则整个控制面板无法操作
      if (playPermission !== 'sync' && volumePermission === 'none' && mutedPermission === 'none' && controlsDom) {
        controlsDom.style.pointerEvents = 'none';
        return;
      }
      if (playPermission !== 'sync' && (volumePermission !== 'none' || mutedPermission !== 'none') && controlsDom) {
        controlsDom.style.pointerEvents = 'none';
        if (volumePermission !== 'none' && volumeDom) {
          volumeDom.style.pointerEvents = 'auto';
        }
        if (mutedPermission !== 'none' && mutedDom) {
          mutedDom.style.pointerEvents = 'auto';
        }
        return;
      }
      if (playPermission === 'sync' && (volumePermission === 'none' || mutedPermission === 'none') && volumeControlDom) {
        volumeControlDom.style.pointerEvents = 'none';
        if (volumePermission !== 'none' && volumeDom) {
          volumeDom.style.pointerEvents = 'auto';
        }
        if (mutedPermission !== 'none' && mutedDom) {
          mutedDom.style.pointerEvents = 'auto';
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

  private willActiveUpdatePlayTimeState = debounce (() => {
    if (this.player) {
      const currentTime = this.player.currentTime;
      const pause = this.player.paused;
      const calibrationTimestamp = this.calibrationTimestamp;
      const startTimestamp = Math.round(calibrationTimestamp - currentTime * 1000);
      if (pause === false) {
        this.setPlayTimeStateData([false, startTimestamp]);
      } else {
        this.setPlayTimeStateData([true, startTimestamp, calibrationTimestamp]);
      }
    }
  }, 500);

  private setVolumeData(volume: number): void {
    console.log('[app plyr] setVolumeData', volume);
    this.context.storage.setState({ volume });  
  }

  private setMutedData(muted: boolean): void {
    console.log('[app plyr] setMutedData', muted);
    this.context.storage.setState({ muted });
  }

  private setPlayTimeStateData(playTimeState: PlayTimeState): void {
    console.log('[app plyr] setPlayTimeStateData', playTimeState);
    this.context.storage.setState({ playTimeState });
  }

  public setVolume(volume: number): void {
    const permission = this.hasPermission('volume');
    switch (permission) {
      case 'sync':
        this.setVolumeData(volume);
        break;
      case 'local': {
        if (this.player) {
          this.player.volume = volume;
        }
        break;
      }
      default:
        throw new Error('You are not permission to set volume');
    }
  }

  public play(): void {
    const permission = this.hasPermission('play');
    switch (permission) {
      case 'sync': {
        const playTimeState = this.playTimeState;
        if (!playTimeState) {
          return this.setPlayTimeStateData([false, this.calibrationTimestamp]);
        }
        if (playTimeState && playTimeState[0] === true) {
          const seekTime = this.player?.currentTime || 0;
          const calibrationTimestamp = this.calibrationTimestamp;
          const newState = [false, Math.round(calibrationTimestamp - seekTime * 1000)] as [false, number];
          return this.setPlayTimeStateData(newState);
        }
        break;
      }
      default:
        throw new Error('You are not permission to play');
    }
  }

  public pause(): void {
    const permission = this.hasPermission('play');
    switch (permission) {
      case 'sync': {
        const pausedState = this.pausedState;
        if (pausedState === false) {
          const seekTime = this.player?.currentTime || 0;
          const calibrationTimestamp = this.calibrationTimestamp;
          const newState = [true, Math.round(calibrationTimestamp - seekTime * 1000), calibrationTimestamp] as [true, number, number];
          return this.setPlayTimeStateData(newState);
        }
        break;
      }
      default:
        throw new Error('You are not permission to play');
    }
  }

  public stop(): void {
    if (!this.player) {
      return;
    }
    const permission = this.hasPermission('play');
    switch (permission) {
      case 'sync': {
        const calibrationTimestamp = this.calibrationTimestamp;
        return this.setPlayTimeStateData([true, calibrationTimestamp - Math.round(this.player.currentTime * 1000), calibrationTimestamp]);
      }
      default:
        throw new Error('You are not permission to play');
    }
  }

  public seekTime(seekTime: number): void {
    const permission = this.hasPermission('seek');
    switch (permission) {
      case 'sync': {
        const calibrationTimestamp = this.calibrationTimestamp;
        const startTime = Math.round(calibrationTimestamp - seekTime * 1000);
        const playTimeState = this.playTimeState;
        if (playTimeState && playTimeState[0] === false) {
          this.setPlayTimeStateData([false, startTime]);
          return;
        }
        this.setPlayTimeStateData([true, startTime, calibrationTimestamp]);
        break;
      }   
      default:
        throw new Error('You are not permission to play');
    }
  }

  public async destroy(): Promise<void> {
    if (this.player) {
      this.cancleCalibrationProgressTime();
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, 500);
      });
      this.player?.destroy();
      this.pcmAudioSource?.disconnect();
      this.pcmAudioSource = undefined;
      this.player = undefined;
      this.playerContainer.innerHTML = '';
    }
  }   
}
