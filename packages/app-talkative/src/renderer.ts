import type { AppContext } from "@netless/window-manager";
import { SideEffectManager } from "side-effect-manager";
import { ResizeObserver as Polyfill } from "@juggle/resize-observer";
import { append, attr, detach, element, writable } from "./utils";
import styles from "./style.css?inline";

const ResizeObserver = window.ResizeObserver || Polyfill;

export class Renderer {
  readonly sideEffect = new SideEffectManager();
  readonly box = this.context.getBox();
  readonly role = writable<0 | 2>(2);
  readonly ratio = writable(16 / 9);
  readonly $content = element("div");
  readonly $iframe = element("iframe");

  constructor(public readonly context: AppContext) {
    attr(this.$content, "class", "app-talkative-container");
    append(this.$content, this.$iframe);
    this.$content.dataset.appKind = "Talkative";
  }

  private _on_update_role(role: 0 | 2) {
    this.$content.dataset.role = String(role);
    this.$content.classList.toggle("owner", role === 0);
  }

  private _on_update_ratio(ratio: number, entry?: ResizeObserverEntry) {
    const { width, height } = entry ? entry.contentRect : this.$content.getBoundingClientRect();
    if (width / ratio > height) {
      const targetWidth = height * ratio;
      this.$iframe.style.width = `${targetWidth}px`;
      this.$iframe.style.height = "";
    } else if (width / ratio < height) {
      const targetHeight = width / ratio;
      this.$iframe.style.width = "";
      this.$iframe.style.height = `${targetHeight}px`;
    }
  }

  private _observe_content_resize() {
    const observer = new ResizeObserver(entries => {
      this._on_update_ratio(this.ratio.value, entries[0]);
    });
    observer.observe(this.$content);
    return observer.disconnect.bind(observer);
  }

  mount() {
    this.box.mountStyles(styles);
    this.box.mountContent(this.$content);

    this.sideEffect.addDisposer(this.role.subscribe(this._on_update_role.bind(this)));
    this.sideEffect.addDisposer(this.ratio.subscribe(this._on_update_ratio.bind(this)));
    this.sideEffect.addDisposer(this._observe_content_resize());

    return this.destroy.bind(this);
  }

  destroy() {
    this.sideEffect.flushAll();

    detach(this.$content);
  }

  postMessage(message: unknown) {
    this.$iframe.contentWindow?.postMessage(message, "*");
  }
}
