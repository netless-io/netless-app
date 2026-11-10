/** Local, explicitly calibrated geometry. Never synchronized to the room. */
export interface YouTubeOverlayLayout {
  id: string;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  /** Full-width native toolbar band, measured from the iframe's top edge. */
  topControlsHeight: number;
  play: { width: number; height: number };
}

interface OverlayState {
  ready: boolean;
  controlsAvailable: boolean;
  writable: boolean;
  paused: boolean;
}

/** The native top toolbar passes through; transport input below belongs to us. */
export class YouTubeOverlay {
  readonly element = document.createElement("div");
  private shields = Array.from({ length: 4 }, () => document.createElement("div"));
  private play = document.createElement("button");
  private resizeObserver?: ResizeObserver;

  constructor(
    private container: HTMLDivElement,
    private layout: YouTubeOverlayLayout | undefined,
    private state: () => OverlayState,
    private togglePlayback: () => void,
  ) {
    this.element.className = "youtube-interaction-overlay";
    this.shields.forEach(shield => {
      shield.className = "youtube-interaction-shield";
      this.element.appendChild(shield);
    });
    this.play.type = "button";
    this.play.className = "youtube-interaction-play";
    this.play.dataset.youtubeRegion = "play";
    this.element.appendChild(this.play);
    this.element.addEventListener("pointerdown", this.consume);
    this.element.addEventListener("pointerup", this.consume);
    this.element.addEventListener("click", this.onClick);
    this.element.addEventListener("dblclick", this.consume);
    this.element.addEventListener("contextmenu", this.consume);
    container.appendChild(this.element);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.update());
      this.resizeObserver.observe(container);
    }
    this.update();
  }

  private consume = (event: Event) => {
    event.stopPropagation();
    // Keep the real pointer -> click sequence and keyboard activation on our button.
    if (event.type !== "pointerdown" && event.cancelable) event.preventDefault();
  };

  private onClick = (event: MouseEvent) => {
    this.consume(event);
    if (event.target === this.play && this.state().writable && this.state().ready) {
      this.togglePlayback();
    }
  };

  private rect(element: HTMLElement, x: number, y: number, width: number, height: number) {
    Object.assign(element.style, {
      left: `${x}px`, top: `${y}px`, width: `${Math.max(0, width)}px`,
      height: `${Math.max(0, height)}px`,
    });
  }

  update() {
    const state = this.state();
    const layout = this.layout;
    const iframe = this.container.querySelector("iframe");
    const parent = this.container.getBoundingClientRect();
    const frame = iframe?.getBoundingClientRect();
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.shields.forEach(shield => this.rect(shield, 0, 0, 0, 0));
    this.rect(this.shields[0], 0, 0, width, height);
    this.play.hidden = true;
    this.element.dataset.layout = "blocked";
    this.element.dataset.topControlsOpen = "false";
    if (!layout || !frame || !parent.width || !parent.height || !state.ready) return;
    const numbers = [layout.minWidth, layout.maxWidth, layout.minHeight, layout.maxHeight,
      layout.topControlsHeight, layout.play.width, layout.play.height];
    if (!numbers.every(Number.isFinite) || layout.minWidth <= 0 || layout.minHeight <= 0 ||
        layout.minWidth > layout.maxWidth || layout.minHeight > layout.maxHeight ||
        layout.topControlsHeight <= 0 ||
        layout.play.width <= 0 || layout.play.height <= 0) return;
    for (let element: HTMLElement | null = iframe; element; element = element.parentElement) {
      const transform = getComputedStyle(element).transform;
      if (transform !== "none") {
        // Bounding-box coordinates only support positive, axis-aligned scale/translation.
        if (typeof DOMMatrix === "undefined") return;
        const matrix = new DOMMatrix(transform);
        if (!matrix.is2D || matrix.b !== 0 || matrix.c !== 0 || matrix.a <= 0 || matrix.d <= 0) return;
      }
    }
    const sx = width / parent.width;
    const sy = height / parent.height;
    const fw = frame.width * sx;
    const fh = frame.height * sy;
    if (fw < layout.minWidth || fw > layout.maxWidth ||
        fh < layout.minHeight || fh > layout.maxHeight || layout.topControlsHeight >= fh) return;
    const ox = (frame.left - parent.left) * sx;
    const oy = (frame.top - parent.top) * sy;
    const x = Math.max(0, ox);
    const y = Math.max(0, oy);
    const toolbarWidth = Math.min(width, ox + fw) - x;
    const toolbarHeight = Math.min(height, oy + layout.topControlsHeight) - y;
    const controls = this.container.querySelector(".custom-plyr-controls")?.getBoundingClientRect();
    this.element.dataset.layout = layout.id;
    if (state.controlsAvailable && toolbarWidth > 0 && toolbarHeight > 0) {
      // Leave the entire toolbar open, including buttons inserted by extensions.
      // The original custom controls retain their own geometry and z-index.
      const hole = { left: parent.left + x / sx, top: parent.top + y / sy,
        right: parent.left + (x + toolbarWidth) / sx, bottom: parent.top + (y + toolbarHeight) / sy };
      const overlaps = controls && controls.left < hole.right && controls.right > hole.left &&
        controls.top < hole.bottom && controls.bottom > hole.top;
      if (!overlaps) {
        this.rect(this.shields[0], 0, 0, width, y);
        this.rect(this.shields[1], 0, y, x, toolbarHeight);
        this.rect(this.shields[2], x + toolbarWidth, y, width - x - toolbarWidth, toolbarHeight);
        this.rect(this.shields[3], 0, y + toolbarHeight, width, height - y - toolbarHeight);
        this.element.dataset.topControlsOpen = "true";
      }
    }
    const px = ox + (fw - layout.play.width) / 2;
    const py = oy + (fh - layout.play.height) / 2;
    const playBottom = py + layout.play.height;
    const controlsTop = controls ? (controls.top - parent.top) * sy : height;
    // A small iframe may fit its toolbar but not the centre button between that
    // toolbar and the original controls. Keep the toolbar open in that case.
    if (px < 0 || px + layout.play.width > width ||
        py < oy + layout.topControlsHeight || playBottom > Math.min(height, controlsTop)) return;
    this.rect(this.play, px, py, layout.play.width, layout.play.height);
    this.play.hidden = false;
    this.play.disabled = !state.writable;
    this.play.tabIndex = state.writable ? 0 : -1;
    this.play.setAttribute("aria-label", state.paused ? "播放 YouTube（同步房间）" : "暂停 YouTube（同步房间）");
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.element.removeEventListener("pointerdown", this.consume);
    this.element.removeEventListener("pointerup", this.consume);
    this.element.removeEventListener("click", this.onClick);
    this.element.removeEventListener("dblclick", this.consume);
    this.element.removeEventListener("contextmenu", this.consume);
    this.element.remove();
  }
}
