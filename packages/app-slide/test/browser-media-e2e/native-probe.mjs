// Observe the real browser nodes, including detached/retired Howler nodes.
// Every wrapped method calls the original unchanged; no playback is simulated.
export function installNativeProbe() {
  const media = new Set();
  const sources = new Map();
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
        nodes,
        activeRetiredNodes: nodes.filter(n => !n.current && !n.paused && !n.ended).length,
        activeRetiredSources: activeSources.filter(([source]) => !currentSources.includes(source))
          .length,
        activeSources: activeSources.length,
      };
    },
  };
}
