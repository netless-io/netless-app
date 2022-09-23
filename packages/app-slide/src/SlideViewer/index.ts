import type { ISlideConfig } from "@netless/slide";
import type { SlideAttributes } from "./typings";

import { Slide } from "@netless/slide";
import { SideEffectManager } from "side-effect-manager";
import { Remitter } from "remitter";

import { DefaultUrl } from "../constants";
import { append, block, hc } from "../utils";
import { fetch_slide_info, make_prefix, on_visibility_change } from "./utils";

import styles from "../style.scss?inline";
import { create_footer } from "./footer";
import { create_sidebar } from "./sidebar";

export type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type SlideViewerOptions = MakeOptional<
  Omit<ISlideConfig & SlideAttributes, "anchor">,
  "mode" | "interactive"
>;

export interface SlideViewerInfoResponse {
  width: number;
  height: number;
  slideCount: number;
}

export interface SlideViewerEventData {
  freeze: void;
  unfreeze: void;
  renderError: { error: Error; index: number };
  prepareError: Error;
}

export class SlideViewer {
  static styles = styles;
  static fetchSlideInfo = fetch_slide_info;

  readonly sideEffect = new SideEffectManager();
  readonly events = new Remitter<SlideViewerEventData>();

  readonly $slide = hc("div", "slide");
  readonly $overlay = hc("div", "overlay");
  readonly sidebar = create_sidebar();
  readonly footer = create_footer();
  readonly $content: HTMLElement;
  readonly $footer: HTMLElement;

  readonly slide: Slide;

  private readonly _readyPromise: Promise<void>;
  private readonly _infoPromise: Promise<SlideViewerInfoResponse>;
  private _ready = false;
  private _slideCount = 0;
  private _destroyed = false;
  private _isFrozen = false;
  private _cachedIsFrozen = false;

  constructor(options: SlideViewerOptions) {
    // user interface
    this.$content = this.sidebar.$content;
    this.$footer = this.footer.$footer;
    append(this.$content, this.$slide);
    append(this.$content, this.$overlay);

    // bind user actions
    this.sidebar.on_new_page_index(this.onNewPageIndex);
    this.footer.on_new_page_index(this.onNewPageIndex);
    this.footer.on_toggle_preview(this.onTogglePreview);
    this.footer.on_play(this.onPlay);

    // remove dom on cleanup
    this.sideEffect.push(this.sidebar.destroy);
    this.sideEffect.push(() => this.slide.destroy());
    this.sideEffect.push(() => {
      this.$content.parentElement && this.$content.remove();
      this.$footer.parentElement && this.$footer.remove();
      this.$slide.parentElement && this.$slide.remove();
    });

    // auto freeze on lost focus
    this.sideEffect.push(
      on_visibility_change(visible => {
        if (this._destroyed) return;
        if (!visible) {
          this._cachedIsFrozen = this._isFrozen;
          this.freeze();
        } else {
          if (!this._cachedIsFrozen) this.unfreeze();
        }
      })
    );

    // start loading slide
    // prepare(info) -> slide.renderEnd(ready)
    const [infoPromise, resolveInfo] = block<SlideViewerInfoResponse>();
    this._infoPromise = infoPromise;

    const fetching = SlideViewer.fetchSlideInfo(options).then(({ preview, slide }) => {
      if (this._destroyed) return;

      this._slideCount = slide.slideCount;

      if (preview) {
        const { taskId, url } = options;
        const { slideCount } = slide;
        const { width, height } = preview;

        const prefix = make_prefix(taskId, url);
        const pages = Array.from({ length: slideCount }, (_, i) => ({
          width,
          height,
          thumbnail: `${prefix}/preview/${i + 1}.png`,
        }));

        this.sidebar.set_pages(pages);
        this.footer.set_sidebar(true);
      }

      this.footer.set_page_count(slide.slideCount);
      resolveInfo(slide);
    });

    fetching.catch(error => {
      console.log("[Slide] fetch slide info error");
      console.error(error);
      this.events.emit("prepareError", error);
    });

    const [readyPromise, resolveReady] = block();
    this._readyPromise = readyPromise;

    this.slide = new Slide({
      anchor: this.$slide,
      mode: "local",
      interactive: true,
      enableGlobalClick: true,
      useLocalCache: true,
      ...options,
    });
    this.slide.setResource(options.taskId, options.url || DefaultUrl);

    this.slide.on("slideChange", page => {
      if (this._destroyed) return;
      this.setPage(page);
    });

    this.slide.on("renderEnd", () => {
      // ready = first render end
      if (!this._ready) {
        setTimeout(() => {
          this._ready = true;
          resolveReady();
        }, 1000);
      } else {
        // otherwise, clear overlay
        this.$overlay.style.opacity = "";
      }
    });

    // show overlay on render error
    this.slide.on("renderError", ev => {
      if (this._destroyed) return;
      if (ev.error) {
        console.error(ev.error);
        this.$overlay.textContent = `Error on slide.index=${ev.index}: ${ev.error.message}`;
        this.$overlay.style.opacity = "1";
        this.events.emit("renderError", ev);
      }
    });

    this.ready(() => {
      if (this._isFrozen) {
        this.freeze();
      }
    });
  }

  prepare(callback: (response: SlideViewerInfoResponse) => void) {
    return this._infoPromise.then(callback);
  }

  ready(callback: () => void) {
    return this._readyPromise.then(callback);
  }

  destroy() {
    this._destroyed = true;
    this.sideEffect.flushAll();
  }

  onPlay = () => {
    this.slide.nextStep();
  };

  onNewPageIndex = (index: number) => {
    if (this._ready && index >= 0 && index < this._slideCount) {
      this.slide.renderSlide(index + 1);
    } else {
      this.setPage(this.slide.slideState.currentSlideIndex);
    }
  };

  onTogglePreview = () => {
    this.sidebar.set_active(!this.sidebar.get_active());
  };

  setReadonly(readonly: boolean) {
    this.slide.setInteractive(!readonly);
    this.sidebar.set_readonly(readonly);
    this.footer.set_readonly(readonly);
  }

  setPage(page: number) {
    this.sidebar.set_page_index(page - 1, true);
    this.footer.set_page_index(page - 1, true);
  }

  freeze() {
    if (this._destroyed) return;
    this._isFrozen = true;
    if (!this._ready) return;
    this.slide.frozen();
    this.events.emit("freeze");
  }

  unfreeze() {
    if (this._destroyed) return;
    this._isFrozen = false;
    if (!this._ready) return;
    this.slide.release();
    this.events.emit("unfreeze");
  }
}
