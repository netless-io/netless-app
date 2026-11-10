import type Plyr from "plyr";

interface AudioState {
  volume: number;
  muted: boolean;
}

interface YouTubeAudioAPI {
  getVolume(): number;
  isMuted(): boolean;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
}

interface AudioCallbacks {
  render(state: AudioState): void;
  nativeChange(change: Partial<AudioState>): void;
  reconcile?(): void;
}

interface AudioCommand<T> {
  target: T;
  before: T | undefined;
  superseded: Set<T>;
}

// Plyr 3.7's YouTube adapter implements these fields, but its public types omit them.
interface YouTubePlyr extends Plyr {
  media: HTMLElement & AudioState;
  config: AudioState;
}

/** Mirrors native audio without treating acknowledgements as new user commands. */
export class YouTubeAudioSync {
  private readonly player: YouTubePlyr;
  private readonly api: YouTubeAudioAPI;
  private previous?: AudioState;
  private rendered?: AudioState;
  private pendingVolume?: AudioCommand<number>;
  private pendingMuted?: AudioCommand<boolean>;
  private adopting = false;
  private renderNeeded = true;
  private destroyed = false;
  private frame = 0;
  private restorers: (() => void)[] = [];

  constructor(player: Plyr, private callbacks: AudioCallbacks) {
    this.player = player as YouTubePlyr;
    this.api = player.embed as unknown as YouTubeAudioAPI;
    this.previous = this.read();
    this.wrapVolume();
    this.wrapMute("mute", true);
    this.wrapMute("unMute", false);
    this.player.media.addEventListener("volumechange", this.onVolumeChange, true);
    this.frame = requestAnimationFrame(this.tick);
  }

  private normalizeVolume(percent: number): number {
    // YouTube and the custom slider use percentage steps. Compare in those units.
    return Math.round(Math.max(0, Math.min(100, percent))) / 100;
  }

  private read(): AudioState | undefined {
    const volume = this.api.getVolume();
    const muted = this.api.isMuted();
    if (!Number.isFinite(volume) || typeof muted !== "boolean") return;
    return { volume: this.normalizeVolume(volume), muted };
  }

  private command<T>(target: T, before: T | undefined, previous?: AudioCommand<T>): AudioCommand<T> {
    const superseded = new Set(previous?.superseded);
    if (previous) superseded.add(previous.target);
    return { target, before: previous ? previous.before : before, superseded };
  }

  private observe<T>(actual: T, previous: T | undefined, command?: AudioCommand<T>): {
    pending?: AudioCommand<T>;
    changed: boolean;
  } {
    if (command) {
      if (actual === command.target) return { changed: false };
      // Known old observations are not new native input. A different value
      // supersedes the command under the audio observation-priority policy.
      if (actual === command.before || command.superseded.has(actual)) return { pending: command, changed: false };
    }
    return { changed: previous !== undefined && actual !== previous };
  }

  private wrapVolume(): void {
    const original = this.api.setVolume;
    const wrapped = (volume: number) => {
      if (this.adopting) return;
      const previous = this.pendingVolume;
      this.pendingVolume = this.command(this.normalizeVolume(volume), this.read()?.volume, previous);
      try {
        original.call(this.api, volume);
      } catch (error) {
        this.pendingVolume = previous;
        throw error;
      }
    };
    this.api.setVolume = wrapped;
    this.restorers.push(() => { if (this.api.setVolume === wrapped) this.api.setVolume = original; });
  }

  private wrapMute(method: "mute" | "unMute", muted: boolean): void {
    const original = this.api[method];
    const wrapped = () => {
      if (this.adopting) return;
      const previous = this.pendingMuted;
      this.pendingMuted = this.command(muted, this.read()?.muted, previous);
      try {
        original.call(this.api);
      } catch (error) {
        this.pendingMuted = previous;
        throw error;
      }
    };
    this.api[method] = wrapped;
    this.restorers.push(() => { if (this.api[method] === wrapped) this.api[method] = original; });
  }

  private onVolumeChange = (event: Event): void => {
    if (this.adopting) {
      // Plyr's media setters update its private cache and emit volumechange.
      // Cache adoption must neither issue API commands nor publish another event.
      event.stopImmediatePropagation();
    } else {
      this.renderNeeded = true;
    }
  };

  private tick = (): void => {
    if (this.destroyed) return;
    this.sample();
    if (!this.destroyed) this.frame = requestAnimationFrame(this.tick);
  };

  private sample(): void {
    if (this.destroyed) return;
    const actual = this.read();
    if (!actual) return;
    const change: Partial<AudioState> = {};
    const volume = this.observe(actual.volume, this.previous?.volume, this.pendingVolume);
    const muted = this.observe(actual.muted, this.previous?.muted, this.pendingMuted);
    this.pendingVolume = volume.pending;
    this.pendingMuted = muted.pending;
    if (volume.changed) change.volume = actual.volume;
    if (muted.changed) change.muted = actual.muted;
    this.previous = actual;

    // Keep an in-flight outer target until the API reports it. In particular,
    // don't let a slow old sample become the volume used by Plyr's mute setter.
    this.adopting = true;
    try {
      if (this.pendingVolume === undefined && this.player.media.volume !== actual.volume) {
        this.player.media.volume = actual.volume;
        this.player.config.volume = actual.volume;
      }
      if (this.pendingMuted === undefined && this.player.media.muted !== actual.muted) {
        this.player.media.muted = actual.muted;
        this.player.config.muted = actual.muted;
      }
    } finally {
      this.adopting = false;
    }
    // Rendering never waits for a particular acknowledgement. Even an ignored
    // command or an unobserved intermediate target cannot freeze the UI.
    const visible = actual;
    if (this.renderNeeded || visible.volume !== this.rendered?.volume || visible.muted !== this.rendered?.muted) {
      this.callbacks.render(visible);
      this.rendered = visible;
      this.renderNeeded = false;
    }
    if (change.volume !== undefined || change.muted !== undefined) this.callbacks.nativeChange(change);
    this.callbacks.reconcile?.();
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.player.media.removeEventListener("volumechange", this.onVolumeChange, true);
    this.restorers.forEach(restore => restore());
    this.restorers = [];
    this.pendingVolume = undefined;
    this.pendingMuted = undefined;
  }
}
