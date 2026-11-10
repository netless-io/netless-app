import type Plyr from "plyr";
import type { PlayTimeState } from "./controller";

/** One atomic room value: commands and native observations use the same timeline. */
export interface YouTubePlaybackTarget {
  id: string;
  author: string;
  source: "command" | "native";
  state: PlayTimeState;
  rate: number;
}

interface YouTubePlaybackAPI {
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoLoadedFraction(): number;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  addEventListener?(name: string, listener: () => void): void;
  removeEventListener?(name: string, listener: () => void): void;
  hasPlayed?: boolean;
}

interface PlaybackCallbacks {
  target(): YouTubePlaybackTarget | undefined;
  now(): number;
  connected(): boolean;
  publisher(): boolean;
  restoreMuted(previous: boolean): boolean;
  publish(paused: boolean, seconds: number, rate: number): YouTubePlaybackTarget;
  render(seconds: number, paused: boolean, loading: boolean): void;
}

/** Native input belongs to one publisher; all other engines follow room intent. */
export class YouTubePlaybackSync {
  public phase: "offline" | "applying" | "following" | "publishing" | "buffering" = "applying";
  private api: YouTubePlaybackAPI;
  private targetId?: string;
  private wasPublisher = false;
  private applying = true;
  private pendingSeek?: number;
  private pendingSeekFrom?: number;
  private pendingPaused?: boolean;
  private commandState?: number;
  private priming = false;
  private primeMuted = false;
  private autoplayRetryId?: string;
  private pendingRate?: number;
  private frame = 0;
  private destroyed = false;
  private sampling = false;

  get isPriming(): boolean { return this.priming; }

  constructor(private player: Plyr, private callbacks: PlaybackCallbacks) {
    this.api = player.embed as unknown as YouTubePlaybackAPI;
    // Plyr otherwise pauses the first native play because its own play() was not
    // called. Native controls are an intentional input in this mode.
    this.api.hasPlayed = true;
    player.on("statechange", this.onStateChange);
    player.on("ratechange", this.onRateChange);
    this.api.addEventListener?.("onAutoplayBlocked", this.onAutoplayBlocked);
    this.frame = requestAnimationFrame(this.tick);
  }

  private position(target: YouTubePlaybackTarget, duration: number): number {
    const [paused, start, stop] = target.state;
    const elapsed = ((paused ? stop! : this.callbacks.now()) - start) / 1000;
    return Math.max(0, Math.min(duration || Infinity, elapsed * target.rate));
  }

  private reset(): void {
    this.finishPriming();
    this.applying = true;
    this.pendingSeek = this.pendingRate = undefined;
    this.pendingSeekFrom = undefined;
    this.pendingPaused = undefined;
    this.commandState = undefined;
    this.autoplayRetryId = undefined;
  }

  private finishPriming(): void {
    if (!this.priming) return;
    this.priming = false;
    this.player.muted = this.callbacks.restoreMuted(this.primeMuted);
  }

  private tick = (): void => {
    this.refresh();
    if (!this.destroyed) this.frame = requestAnimationFrame(this.tick);
  };

  private onStateChange = (): void => {
    if (this.destroyed) return;
    const code = this.api.getPlayerState();
    if (code === 1 || code === 2 || code === 0) {
      // A stable result can belong to a native operation that replaced our
      // command. Recheck the newest room target and allow another attempt.
      // Ordinary rAF observations keep pending commands deduplicated.
      this.pendingSeek = undefined;
      this.pendingPaused = undefined;
    }
    this.refresh();
  };

  private onRateChange = (): void => {
    if (this.destroyed) return;
    this.pendingRate = undefined;
    this.refresh();
  };

  /** Reads the newest target on every pass; no delayed callback owns a stale goal. */
  public refresh = (): void => {
    if (this.destroyed || this.sampling) return;
    this.sampling = true;
    try {
      this.sample();
    } finally {
      this.sampling = false;
    }
  };

  private sample(): void {
    if (!this.callbacks.connected()) {
      this.phase = "offline";
      this.wasPublisher = false;
      this.reset();
      return;
    }
    let target = this.callbacks.target();
    if (!target) return;
    const publisher = this.callbacks.publisher();
    const changed = target.id !== this.targetId || publisher !== this.wasPublisher;
    if (changed) {
      this.targetId = target.id;
      this.wasPublisher = publisher;
      this.reset();
    }
    const code = this.api.getPlayerState();
    const seconds = this.api.getCurrentTime();
    const duration = this.api.getDuration();
    const rate = this.api.getPlaybackRate();
    if (![code, seconds, rate].every(Number.isFinite) || rate <= 0) return;
    let expected = this.position(target, duration);
    const paused = code !== 1;
    const stable = code === 1 || code === 2 || code === 0;
    const cued = code === 5 || code === -1;
    // YouTube can remain unstarted/cued after a paused seek, while reporting
    // the requested position. This can acknowledge a paused target, never play.
    const pausedCued = cued && target.state[0] && Math.abs(seconds - expected) <= 1 &&
      (expected === 0 || this.api.getVideoLoadedFraction() > 0);
    const atEnd = duration > 0 && seconds >= duration - 0.1;

    // Buffering is neither a pause command nor a progress observation. A NEW
    // room command may still replace an old in-flight load while buffering.
    if (!stable && !pausedCued && !(changed || (cued && this.applying))) {
      this.phase = "buffering";
      this.callbacks.render(expected, target.state[0], true);
      return;
    }

    if (publisher && !this.applying && stable) {
      if (paused !== target.state[0] || Math.abs(seconds - expected) > 1 || rate !== target.rate) {
        target = this.callbacks.publish(paused, seconds, rate);
        this.targetId = target.id;
        expected = seconds;
      }
      this.phase = "publishing";
      this.callbacks.render(expected, target.state[0], false);
      return;
    }

    // Paused native scrubbing can change position without any state event.
    // A new paused position permits one retry; an unchanged old observation
    // keeps the command pending, rather than sending seek on every frame.
    if (this.pendingSeek !== undefined && target.state[0] && (code === 2 || code === 0) &&
        this.pendingSeekFrom !== undefined && seconds !== this.pendingSeekFrom) this.pendingSeek = undefined;
    if (this.pendingSeek !== undefined && (stable || pausedCued) &&
        (Math.abs(seconds - this.pendingSeek) <= 1 || Math.abs(seconds - expected) <= 1)) this.pendingSeek = undefined;
    if (this.pendingPaused !== undefined && (stable || pausedCued) && paused === this.pendingPaused) this.pendingPaused = undefined;
    else if (stable && code !== this.commandState) this.pendingPaused = undefined;
    if (this.pendingRate !== undefined && rate === this.pendingRate) this.pendingRate = undefined;
    const stateMatches = paused === target.state[0] && (stable || pausedCued);
    const error = expected - seconds;
    const endedTarget = atEnd && paused && expected >= duration - 0.1;
    if ((stateMatches || endedTarget) && Math.abs(error) <= 1 && rate === target.rate &&
        this.pendingSeek === undefined && this.pendingPaused === undefined && this.pendingRate === undefined) {
      this.applying = false;
      this.finishPriming();
      this.phase = publisher ? "publishing" : "following";
      this.callbacks.render(expected, target.state[0], false);
      return;
    }

    this.phase = this.applying ? "applying" : "following";
    // A new command, a paused seek or a large native jump needs a seek. Smaller
    // running drift uses the original correction thresholds relative to base rate.
    const seek = Math.abs(error) > 1 && (this.applying || target.state[0] || !stateMatches || Math.abs(error) >= 8);
    let desiredRate = target.rate;
    if (!seek && !target.state[0]) {
      const factor = error >= 6 ? 3 : error >= 4 ? 2 : error >= 2 ? 1.5 : error > 1 ? 1.25 :
        error <= -4 ? 0.5 : error < -1 ? 0.75 : 1;
      const available = this.api.getAvailablePlaybackRates();
      const candidates = available.filter(value => factor > 1 ? value > target!.rate : value < target!.rate);
      if (factor !== 1 && candidates.length) desiredRate = candidates.reduce((a, b) =>
        Math.abs(a - target!.rate * factor) < Math.abs(b - target!.rate * factor) ? a : b);
      else if (factor !== 1 && this.pendingSeek === undefined) {
        this.pendingSeek = expected;
        this.pendingSeekFrom = seconds;
        this.player.currentTime = expected;
      }
    }
    if (rate !== desiredRate && this.pendingRate !== desiredRate) {
      this.pendingRate = desiredRate;
      this.player.speed = desiredRate;
    }
    let seekIssued = false;
    if (seek && this.pendingSeek === undefined) {
      this.pendingSeek = expected;
      this.pendingSeekFrom = seconds;
      this.player.currentTime = expected;
      seekIssued = true;
    }
    if (target.state[0] && expected > 0 && cued && this.api.getVideoLoadedFraction() === 0) {
      // A paused seek can report its destination without loading any media.
      // Warm the decoder muted, then pause on the stable playing observation;
      // all of this remains inside the current room command's applying phase.
      if (!this.priming) {
        this.priming = true;
        this.primeMuted = this.player.muted;
        this.player.muted = true;
        this.pendingPaused = false;
        this.commandState = code;
        Promise.resolve(this.player.play()).catch(this.onAutoplayBlocked);
      }
      this.callbacks.render(expected, true, true);
      return;
    }
    if ((!stateMatches || (seekIssued && target.state[0])) && !endedTarget && this.pendingPaused !== target.state[0]) {
      this.pendingPaused = target.state[0];
      this.commandState = code;
      if (target.state[0]) this.player.pause();
      else Promise.resolve(this.player.play()).catch(this.onAutoplayBlocked);
    }
    this.callbacks.render(expected, target.state[0], this.applying || !stable);
  }

  private onAutoplayBlocked = (): void => {
    const target = this.callbacks.target();
    if (this.destroyed || !this.callbacks.connected() || !target ||
        (target.state[0] && !this.priming) || this.autoplayRetryId === target.id) return;
    this.autoplayRetryId = target.id;
    // The browser may require muted autoplay on a late join. This is a local
    // API command, so the audio adapter will not publish it as native input.
    this.player.muted = true;
    Promise.resolve(this.player.play()).catch(() => {});
  };

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.player.off("statechange", this.onStateChange);
    this.player.off("ratechange", this.onRateChange);
    this.api.removeEventListener?.("onAutoplayBlocked", this.onAutoplayBlocked);
    this.reset();
  }
}
