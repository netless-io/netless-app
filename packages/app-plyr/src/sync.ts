import type Plyr from "plyr";
import type { AppContext, Player, Storage } from "@netless/window-manager";
import type { Attributes } from "./index";

import { clamp, first, safePlay } from "./utils";

export class Sync {
  /**
   * `ideal`: user action triggers player state change, nothing more.
   *
   * `owner`: user action switches owner, owner publishes player state.
   */
  behavior: "ideal" | "owner" = "owner";

  readonly uid: string;
  readonly getTimestamp: () => number | undefined;

  private _skip_next_play_pause = 0;
  private _sync_timer = 0;
  private _interval = 1000;
  private _blink = 0;
  private _player: Plyr | null = null;
  private _buffering = false;
  private _throttle = 0;
  private _dispatch_time_again = false;
  private _buffering_timer = 0;
  private _disposer: (() => void) | null = null;

  constructor(readonly context: AppContext<Attributes>, readonly storage: Storage<Attributes>) {
    const room = context.room;
    const player = context.displayer as Player;

    this.uid = room ? room.uid : "";
    this.getTimestamp = room
      ? () => room.calibrationTimestamp
      : () => player.beginTimestamp + player.progressTime;

    this._disposer = storage.on("stateChanged", this.syncAll.bind(this));
  }

  dispose() {
    this._disposer && this._disposer();
    this._disposer = null;
    clearInterval(this._sync_timer);
    clearTimeout(this._buffering_timer);
  }

  get player(): Plyr | null {
    return this._player;
  }

  set player(player: Plyr | null) {
    this._player = player;
    player && player.once("ready", this.setupPlayer.bind(this, player));
  }

  setupPlayer(player: Plyr) {
    player.toggleControls(this.context.isWritable);
    this.registerListeners(player);
    this.watchUserInputs(player);
    this._sync_timer = setInterval(this.syncAll.bind(this), this._interval);
  }

  setState(partial: Partial<Attributes>) {
    this.context.isWritable && this.storage.setState(partial);
  }

  syncAll() {
    const { behavior, player, context, storage } = this;
    // wait before player set
    if (!player) return;

    const { currentTime, hostTime, muted, paused, volume, owner } = storage.state;
    // if the state comes from self, don't sync
    if (behavior === "owner" && owner === this.uid && context.isWritable) return;

    if (paused !== player.paused && !this._skip_next_play_pause) {
      paused ? player.pause() : safePlay(player);
    }

    if (muted !== player.muted) {
      player.muted = muted;
    }

    if (volume !== player.volume) {
      player.volume = volume;
    }
    // if buffering, don't sync currentTime in immediate
    if (this._buffering) return;

    if (paused) {
      if (Math.abs(player.currentTime - currentTime) > 0.5) {
        player.currentTime = currentTime;
      }
    } else {
      this.syncCurrentTime(hostTime, currentTime, player);
    }
  }

  private watchUserInputs(player: Plyr) {
    const $controls = player.elements.controls;
    const $play = first(player.elements.buttons.play);
    const $seek = $controls?.querySelector('input[data-plyr="seek"]') as HTMLInputElement;
    const $mute = $controls?.querySelector('button[data-plyr="mute"]') as HTMLButtonElement;
    const $volume = $controls?.querySelector('input[data-plyr="volume"]') as HTMLInputElement;

    this.fixSeekBarOnInit($seek, player);

    $play?.addEventListener("click", () => {
      this.behavior === "owner" && this.dispatchOwner();
      this.dispatchPlayPause(player);
    });

    $seek?.addEventListener("change", () => {
      this.behavior === "owner" && this.dispatchOwner();
      this.dispatchSeek(player, $seek);
    });

    $mute?.addEventListener("click", () => {
      this.behavior === "owner" && this.dispatchOwner();
      this.dispatchVolume(player);
    });

    $volume?.addEventListener("change", () => {
      this.behavior === "owner" && this.dispatchOwner();
      this.dispatchVolume(player);
    });
  }

  private fixSeekBarOnInit($seek: HTMLInputElement, player: Plyr) {
    const { currentTime } = this.storage.state;
    if (player.duration && currentTime && $seek) {
      const percent = (100 * currentTime) / player.duration;
      $seek.value = percent.toFixed(2);
    }
  }

  private registerListeners(player: Plyr) {
    player.on("ended", () => {
      player.stop();
      this.setState({ paused: true, currentTime: 0 });
    });
    player.on("waiting", () => {
      this._buffering = true;
      this._buffering_timer = setTimeout(this.clearBuffering.bind(this), this._interval / 2);
    });
    player.on("playing", () => {
      this._buffering = false;
    });
    player.on("timeupdate", () => {
      this.isOwner() && this.dispatchCurrentTime(player);
    });
    player.on("volumechange", () => {
      this.isOwner() && this.dispatchVolume(player);
    });
    player.on("play", () => {
      this.isOwner() && this.dispatchPlayPause(player);
    });
    player.on("pause", () => {
      this.isOwner() && this.dispatchPlayPause(player);
    });
  }

  private clearBuffering() {
    this._buffering = false;
    this._buffering_timer = 0;
  }

  private dispatchOwner() {
    if (this.storage.state.owner !== this.uid) {
      this.setState({ owner: this.uid });
    }
  }

  private dispatchPlayPause(player: Plyr) {
    this.setState({
      hostTime: this.getTimestamp(),
      currentTime: player.currentTime,
      paused: player.paused,
    });
    clearTimeout(this._skip_next_play_pause);
    this._skip_next_play_pause = setTimeout(this.skipNextPlayPause.bind(this), 500);
  }

  private skipNextPlayPause() {
    this._skip_next_play_pause = 0;
  }

  private dispatchVolume(player: Plyr) {
    this.setState({
      muted: player.muted,
      volume: player.volume,
    });
  }

  private dispatchSeek(player: Plyr, $seek: HTMLInputElement) {
    const currentTime = ($seek.valueAsNumber * player.duration) / 100;
    this.setState({ hostTime: this.getTimestamp(), currentTime });
  }

  private dispatchCurrentTime(player: Plyr) {
    if (this._throttle) {
      this._dispatch_time_again = true;
      return;
    }
    this.setState({
      hostTime: this.getTimestamp(),
      currentTime: player.currentTime,
    });
    this._throttle = setTimeout(this.clearThrottle.bind(this, player), 1000);
  }

  private clearThrottle(player: Plyr) {
    this._throttle = 0;
    if (this._dispatch_time_again) {
      this._dispatch_time_again = false;
      this.dispatchCurrentTime(player);
    }
  }

  private isOwner() {
    return this.behavior === "owner" && this.storage.state.owner === this.uid;
  }

  private syncCurrentTime(hostTime: number, currentTime: number, player: Plyr) {
    const now = this.getTimestamp();
    if (now && hostTime) {
      const expected = currentTime + (now - hostTime) / 1000;
      if (Math.abs(expected - player.currentTime) > 1) {
        player.currentTime = expected;
        this._blink++;
        if (this._blink > 3) {
          this.updateSyncInterval(true);
        }
      } else {
        this.updateSyncInterval(false);
      }
    }
  }

  private updateSyncInterval(inc: boolean) {
    this._blink = 0;
    this._interval = clamp(this._interval + (inc ? 2000 : -2000), 1000, 15000);
    clearTimeout(this._sync_timer);
    this._sync_timer = setInterval(this.syncAll.bind(this), this._interval);
  }
}
