import type { ISlideConfig } from "@netless/slide";
import type { ILogger } from "../typings";
import type { SlideAttributes } from "./typings";

import { Slide } from "@netless/slide";
import { SideEffectManager } from "side-effect-manager";

import { DefaultUrl } from "../constants";
import { append, h, set_class } from "../utils";
import { fetch_slide_info, make_prefix, on_visibility_change } from "./utils";

import styles from "../style.scss?inline";
import { create_footer } from "./footer";
import { create_sidebar } from "./sidebar";

export type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type SlideViewerOptions = MakeOptional<
  Omit<ISlideConfig, "anchor">,
  "mode" | "interactive"
> &
  SlideAttributes;

export interface SlideViewerInfoResponse {
  width: number;
  height: number;
  slideCount: number;
}

function create_slide_wrapper() {
  const $slide = h("div");
  set_class($slide, "slide");
  return $slide;
}

function create_overlay() {
  const $overlay = h("div");
  set_class($overlay, "overlay");
  return $overlay;
}

export class SlideViewer {
  static styles = styles;
  static fetchSlideInfo = fetch_slide_info;

  readonly sideEffect = new SideEffectManager();

  readonly $slide = create_slide_wrapper();
  readonly $overlay = create_overlay();
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

  private _logger: ILogger;

  constructor(options: SlideViewerOptions) {
    this._logger = options.logger || console;

    this.$content = this.sidebar.$content;
    this.$footer = this.footer.$footer;
    append(this.$content, this.$slide);
    append(this.$content, this.$overlay);

    let resolveReady: () => void;
    this._readyPromise = new Promise(resolve => {
      resolveReady = resolve;
    });

    const on_new_page_index = (index: number) => {
      if (this._ready && index >= 0 && index < this._slideCount) {
        this.slide.renderSlide(index + 1);
      } else {
        this.setPage(this.slide.slideState.currentSlideIndex);
      }
    };
    this.sidebar.on_new_page_index(on_new_page_index);
    this.footer.on_new_page_index(on_new_page_index);

    this.footer.on_toggle_preview(() => {
      this.sidebar.set_active(!this.sidebar.get_active());
    });

    this.footer.on_play(() => {
      this.slide.nextStep();
    });

    this.sideEffect.addDisposer(this.sidebar.destroy);
    this.sideEffect.addDisposer(() => this.slide.destroy());
    this.sideEffect.addDisposer(() => {
      this.$content.parentElement && this.$content.remove();
      this.$footer.parentElement && this.$footer.remove();
      this.$slide.parentElement && this.$slide.remove();
    });

    let saved_is_frozen = false;
    this.sideEffect.addDisposer(
      on_visibility_change(visible => {
        if (this._destroyed) return;
        if (!visible) {
          saved_is_frozen = this._isFrozen;
          this.freeze();
        } else {
          if (!saved_is_frozen) this.unfreeze();
        }
      })
    );

    this.slide = new Slide({
      anchor: this.$slide,
      mode: "local",
      interactive: true,
      enableGlobalClick: true,
      useLocalCache: true,
      ...options,
    });
    this.slide.setResource(options.taskId, options.url || DefaultUrl);

    let resolveFetching: (response: SlideViewerInfoResponse) => void;
    this._infoPromise = new Promise<SlideViewerInfoResponse>(resolve => {
      resolveFetching = resolve;
    });

    this.slide.on("slideChange", page => {
      if (this._destroyed) return;
      this.setPage(page);
    });

    this.slide.on("renderEnd", () => {
      if (!this._ready) {
        setTimeout(() => {
          this._ready = true;
          resolveReady();
        }, 1000);
      } else {
        this.$overlay.style.opacity = "";
      }
    });

    this.slide.on("renderError", ({ error, index }) => {
      if (this._destroyed) return;
      if (error) {
        console.error(error);
        this.$overlay.textContent = `Error on slide[index=${index}]: ${error.message}`;
        this.$overlay.style.opacity = "1";
      }
    });

    const fetching = fetch_slide_info(options).then(({ preview, slide }) => {
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
      resolveFetching(slide);
    });

    fetching.catch(error => {
      console.log("[Slide] fetch slide info error");
      console.error(error);
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

  setReadonly(readonly: boolean) {
    this.slide.setInteractive(!readonly);
    this.sidebar.set_readonly(readonly);
    this.footer.set_readonly(readonly);
  }

  setPage(page: number) {
    this.sidebar.set_page_index(page - 1, true);
    this.footer.set_page_index(page - 1, true);
  }

  private _isFrozen = false;

  freeze() {
    if (this._destroyed) return;
    this._isFrozen = true;
    if (!this._ready) return;
    this.slide.frozen();
    this._logger.info?.("[Slide] freeze");
  }

  unfreeze() {
    if (this._destroyed) return;
    this._isFrozen = false;
    if (!this._ready) return;
    this.slide.release();
    this._logger.info?.("[Slide] release");
  }
}
