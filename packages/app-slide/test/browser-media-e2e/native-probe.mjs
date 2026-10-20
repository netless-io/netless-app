// Observe the real browser nodes, including detached/retired Howler nodes.
// Every wrapped method calls the original unchanged; no playback is simulated.
export function installNativeProbe() {
  const media = new Set();
  const sources = new Map();
  const observedLoads = new WeakSet();
  const errors = [];
  const originalLoad = HTMLMediaElement.prototype.load;
  HTMLMediaElement.prototype.load = function (...args) {
    if (!observedLoads.has(this)) {
      observedLoads.add(this);
      this.addEventListener("error", () => {
        const src = this.currentSrc || this.src;
        if (src && !src.startsWith("data:"))
          errors.push({
            at: Date.now(),
            kind: this.tagName,
            path: new URL(src, location.href).pathname,
            code: this.error?.code,
            message: this.error?.message,
            readyState: this.readyState,
            networkState: this.networkState,
            time: this.currentTime,
          });
      });
    }
    return originalLoad.apply(this, args);
  };
  let audioStarts = 0;
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (!media.has(this))
      this.addEventListener("playing", () => {
        if (this.tagName === "AUDIO" && this.src && !this.src.startsWith("data:")) audioStarts++;
      });
    media.add(this);
    return originalPlay.apply(this, args);
  };
  const contexts = new Set([window.AudioContext, window.webkitAudioContext].filter(Boolean));
  for (const Context of contexts) {
    const create = Context.prototype.createBufferSource;
    Context.prototype.createBufferSource = function (...args) {
      const source = create.apply(this, args);
      const row = { started: false, ended: false, realMedia: false, stoppedAt: undefined };
      sources.set(source, row);
      const start = source.start;
      source.start = function (...values) {
        const result = start.apply(this, values);
        row.started = true;
        row.realMedia = source.buffer?.duration > 0.1;
        if (row.realMedia) audioStarts++;
        return result;
      };
      const stop = source.stop;
      source.stop = function (...values) {
        const result = stop.apply(this, values);
        row.stoppedAt = values[0] || 0;
        return result;
      };
      source.addEventListener("ended", () => {
        row.ended = true;
      });
      return source;
    };
  }
  const sourceActive = source => {
    const row = sources.get(source);
    return !!(
      row?.realMedia &&
      row.started &&
      !row.ended &&
      (row.stoppedAt === undefined || source.context.currentTime < row.stoppedAt)
    );
  };
  window.__nativeMediaProbe = {
    sourceActive,
    nodes: media,
    sample(currentNodes = [], currentSources = []) {
      const nodes = [...media]
        .map((node, id) => ({
          id,
          kind: node.tagName,
          paused: node.paused,
          ended: node.ended,
          time: node.currentTime,
          current: currentNodes.includes(node),
          realMedia: !!node.src && !node.src.startsWith("data:"),
        }))
        .filter(n => n.realMedia);
      const activeSources = [...sources].filter(([source]) => sourceActive(source));
      return {
        audioStarts,
        errors: errors.slice(),
        nodes,
        activeRetiredNodes: nodes.filter(n => !n.current && !n.paused && !n.ended).length,
        activeRetiredSources: activeSources.filter(([source]) => !currentSources.includes(source))
          .length,
        activeSources: activeSources.length,
      };
    },
  };
}
