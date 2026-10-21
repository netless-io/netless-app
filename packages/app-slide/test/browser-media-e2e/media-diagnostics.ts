// Bounded observations of real execution. No media setters, promises or events
// are replaced; every wrapped method preserves its receiver and return value.
const rows: object[] = [];
const ids = new WeakMap<object, number>();
const mediaByTrack = new WeakMap<object, { media?: number; mediaId?: string }>();
const tracks = new WeakSet<object>();
const prototypes = new WeakSet<object>();
const nodes = new WeakSet<object>();
let serial = 0;

function id(value: any) {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return undefined;
  if (!ids.has(value)) ids.set(value, ++serial);
  return ids.get(value);
}

function record(kind: string, track: any, extra: object = {}) {
  try {
    const snapshot = track.backend.snapshot();
    const node = snapshot.node;
    const pending = track.pending;
    const media = mediaByTrack.get(track);
    rows.push({
      at: Date.now(),
      monotonic: performance.now(),
      kind,
      track: id(track),
      owner: id(snapshot.owner),
      node: id(node),
      media: media?.media,
      mediaId: media?.mediaId,
      revision: track.revision,
      desiredPlaying: track.desiredPlaying,
      suspended: track.suspended,
      disposed: track.disposed,
      position: typeof snapshot.position === "number" ? snapshot.position : undefined,
      playing: snapshot.playing,
      locked: snapshot.locked,
      ready: snapshot.ready,
      nativeTime: node?.currentTime,
      paused: node?.paused,
      seeking: node?.seeking,
      pending: pending && {
        revision: pending.revision,
        time: pending.time,
        live: pending.live,
        resume: pending.resume,
        clock: !!pending.clock,
        corrections: pending.corrections,
        applied: pending.applied && {
          owner: id(pending.applied.owner),
          time: pending.applied.time,
        },
        quiet: !!pending.pausedRecovery,
      },
      ...extra,
    });
    if (rows.length > 600) rows.splice(0, rows.length - 600);
  } catch {
    // A retired backend can no longer be readable. Observation cannot change
    // its original operation's return value, exception or cleanup path.
  }
}

// The native probe intentionally retains retired nodes to detect ghost audio.
// Its nodes must not retain an old track/media/renderer through this listener.
function nativeListener(reference: WeakRef<any>, name: string) {
  return (event: Event) => {
    const track = reference.deref();
    if (!track) return;
    const target = event.target as HTMLMediaElement;
    if (name === "timeupdate" && !target.paused && !track.pending) return;
    record("native:" + name, track, {
      eventNode: id(target),
      eventTime: target.currentTime,
      eventPaused: target.paused,
      eventSeeking: target.seeking,
    });
  };
}

function observeTrack(track: any) {
  try {
    const node = track.backend.snapshot().node;
    if (node && !nodes.has(node)) {
      nodes.add(node);
      for (const name of ["pause", "play", "playing", "seeking", "seeked", "timeupdate"]) {
        node.addEventListener(name, nativeListener(new WeakRef(track), name));
      }
    }
    if (tracks.has(track)) return;
    tracks.add(track);
    record("attach", track);
    for (const name of ["seek", "pause", "play", "resumeSeek", "recoverPausedSeek"]) {
      const original = track.backend[name];
      if (typeof original !== "function") continue;
      track.backend[name] = function (...args: any[]) {
        record("backend:" + name + ":call", track, {
          args: args.map(value =>
            typeof value === "object" || typeof value === "function" ? undefined : value
          ),
        });
        try {
          return original.apply(this, args);
        } finally {
          record("backend:" + name + ":return", track);
        }
      };
    }
  } catch {
    // Keep diagnostics optional when a backend is already disposed.
  }
}

export function observeMediaExecution(media: any) {
  if (!media) return;
  for (const track of [media.videoExecution, (media.rtcAudio || media.audioPlayer)?.execution]) {
    if (!track) continue;
    mediaByTrack.set(track, { media: id(media), mediaId: media.id });
    observeTrack(track);
    const prototype = Object.getPrototypeOf(track);
    if (prototypes.has(prototype)) continue;
    prototypes.add(prototype);
    // New tracks created by release can seek before the next harness sample.
    // Observe the same prototype so those first operations retain their IDs.
    for (const name of ["seek", "position", "finish", "pause", "play", "setSuspended", "destroy"]) {
      const original = prototype[name];
      if (typeof original !== "function") continue;
      prototype[name] = function (...args: any[]) {
        observeTrack(this);
        record(name, this, {
          args: args.map(value =>
            typeof value === "object" || typeof value === "function" ? undefined : value
          ),
        });
        return original.apply(this, args);
      };
    }
  }
}

export function mediaExecutionTrace() {
  return rows.slice();
}
