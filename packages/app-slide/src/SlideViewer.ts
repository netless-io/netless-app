import type { ISlideConfig } from "@netless/slide";

import { Slide } from "@netless/slide";
import { SideEffectManager } from "side-effect-manager";
import LazyLoad from "vanilla-lazyload";

import { DefaultUrl, namespace } from "./constants";
import { noop } from "./utils";
import styles from "./style.scss?inline";

import { sidebarSVG } from "./icons/sidebar";
import { arrowLeftSVG } from "./icons/arrow-left";
import { playSVG } from "./icons/play";
import { pauseSVG } from "./icons/pause";
import { arrowRightSVG } from "./icons/arrow-right";

function h<K extends keyof HTMLElementTagNameMap>(tag: K) {
  return document.createElement(tag);
}

function append(parent: HTMLElement, child: HTMLElement) {
  return parent.appendChild(child);
}

function wrap_class(name: string) {
  return `${namespace}-${name}`;
}

function set_class(el: HTMLElement, name: string) {
  el.className = wrap_class(name);
}

function trim_slash(s: string) {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

interface SlideAttributes {
  taskId: string;
  url?: string;
}

interface PreviewPage {
  width: number;
  height: number;
  thumbnail: string;
}

interface PreviewInfo {
  width: number;
  height: number;
}

interface SlideInfo {
  width: number;
  height: number;
  slideCount: number;
}

async function fetch_slide_info({ taskId, url }: SlideAttributes): Promise<{
  preview: PreviewInfo | null;
  slide: SlideInfo;
}> {
  const prefix = make_prefix(taskId, url);
  const imgSrc = `${prefix}/preview/1.png`;
  const jsonUrl = `${prefix}/jsonOutput/slide-1.json`;

  const p1 = new Promise<PreviewInfo | null>(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = imgSrc;
  });

  const p2: Promise<SlideInfo> = fetch(jsonUrl).then(r => r.json());

  return { preview: await p1, slide: await p2 };
}

function make_prefix(taskId: string, url?: string) {
  return `${trim_slash(url || DefaultUrl)}/${taskId}`;
}

function create_sidebar() {
  type NewPageIndexCallback = (newPageIndex: number) => void;
  let new_page_index_callback: NewPageIndexCallback = noop;
  const on_new_page_index = (callback: NewPageIndexCallback) => {
    new_page_index_callback = callback;
  };

  let destroyed = false;
  let readonly = false;
  let active = false;
  let pages: PreviewPage[] = [];
  let page_index = 0;

  const class_readonly = wrap_class("readonly");
  const class_preview_active = wrap_class("preview-active");

  const $content = h("div");
  set_class($content, "content");

  const $previewMask = h("div");
  set_class($previewMask, "preview-mask");
  $previewMask.onclick = function on_click_preview_mask(ev) {
    if (readonly) return;
    if (ev.target !== $previewMask) return;
    set_active(false);
  };
  append($content, $previewMask);

  const $preview = h("div");
  set_class($preview, "preview");
  $preview.classList.add(wrap_class("tele-fancy-scrollbar"));
  $preview.onclick = function on_click_preview(ev) {
    if (readonly) return;
    const page_index = (ev.target as HTMLElement).dataset?.pageIndex;
    if (page_index) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      new_page_index_callback(Number(page_index));
      set_active(false);
    }
  };
  append($content, $preview);

  const lazyload = new LazyLoad({
    container: $preview,
    elements_selector: `.${wrap_class("preview-page>img")}`,
  });

  function set_readonly(readonly_: boolean) {
    if (readonly !== readonly_) {
      readonly = readonly_;
      $content.classList.toggle(class_readonly, readonly);
    }
  }

  function set_active(active_: boolean) {
    if (active !== active_) {
      active = active_;
      $content.classList.toggle(class_preview_active, active);
    }
  }

  function set_pages(pages_: PreviewPage[]) {
    if (pages !== pages_) {
      pages = pages_;

      const page_class = wrap_class("preview-page");
      const page_name_class = wrap_class("preview-page-name");

      pages.forEach((page, i) => {
        const pageIndex = String(i);

        const $page = h("a");
        $page.className = page_class + " " + wrap_class(`preview-page-${i}`);
        $page.href = "#";
        $page.dataset.pageIndex = pageIndex;

        const $name = h("span");
        $name.className = page_name_class;
        $name.textContent = String(i + 1);
        $name.dataset.pageIndex = pageIndex;

        const $img = h("img");
        $img.width = page.width;
        $img.height = page.height;
        $img.src = page.thumbnail;
        $img.alt = `page-${i}`;
        $img.dataset.pageIndex = pageIndex;

        append($page, $img);
        append($page, $name);
        append($preview, $page);
      });

      if (!destroyed) {
        lazyload.update();
      }
    }
  }

  function set_page_index(page_index_: number, force = false) {
    if (force || page_index !== page_index_) {
      page_index = page_index_;
      const $page = $preview.querySelector<HTMLElement>(
        `.${wrap_class(`preview-page-${page_index}`)}`
      );
      if ($page) {
        $preview.scrollTo({ top: $page.offsetTop - 16 });
      }
    }
  }

  function destroy() {
    destroyed = true;
    lazyload.destroy();
  }

  function get_active() {
    return active;
  }

  return {
    $content,
    $preview,
    set_readonly,
    set_active,
    get_active,
    set_pages,
    on_new_page_index,
    set_page_index,
    destroy,
  };
}

function create_footer() {
  type NewPageIndexCallback = (newPageIndex: number) => void;
  let new_page_index_callback: NewPageIndexCallback = noop;
  const on_new_page_index = (callback: NewPageIndexCallback) => {
    new_page_index_callback = callback;
  };

  let toggle_preview_callback: () => void = noop;
  const on_toggle_preview = (callback: () => void) => {
    toggle_preview_callback = callback;
  };

  let play_callback: () => void = noop;
  const on_play = (callback: () => void) => {
    play_callback = callback;
  };

  let readonly = false;
  let sidebar = false;
  let page_index = 0;
  let page_count = 0;

  const $footer = h("div");
  set_class($footer, "footer");

  const $btnSidebar = h("button");
  set_class($btnSidebar, "btn-sidebar");
  $btnSidebar.classList.add(wrap_class("footer-btn"));
  $btnSidebar.appendChild(sidebarSVG(namespace));
  $btnSidebar.onclick = function on_click_btn_sidebar() {
    if (readonly) return;
    toggle_preview_callback();
  };
  $btnSidebar.style.display = "none";
  $footer.appendChild($btnSidebar);

  const $pageJumps = h("div");
  set_class($pageJumps, "page-jumps");

  const $btnPageBack = h("button");
  set_class($btnPageBack, "btn-page-back");
  $btnPageBack.classList.add(wrap_class("footer-btn"));
  $btnPageBack.appendChild(arrowLeftSVG(namespace));
  $btnPageBack.onclick = function on_click_btn_page_back() {
    if (readonly) return;
    new_page_index_callback(page_index - 1);
  };
  $pageJumps.appendChild($btnPageBack);

  const $btnPlay = h("button");
  set_class($btnPlay, "btn-page-play");
  $btnPlay.classList.add(wrap_class("footer-btn"));
  $btnPlay.appendChild(playSVG(namespace));
  $btnPlay.appendChild(pauseSVG(namespace));
  let returnPlayTimer = 0;
  $btnPlay.onclick = function on_click_btn_play() {
    if (readonly) return;
    $btnPlay.classList.add(wrap_class("footer-btn-playing"));
    play_callback();
    clearTimeout(returnPlayTimer);
    returnPlayTimer = setTimeout(() => {
      $btnPlay.classList.remove(wrap_class("footer-btn-playing"));
    }, 500);
  };
  $pageJumps.appendChild($btnPlay);

  const $btnPageNext = h("button");
  set_class($btnPageNext, "btn-page-next");
  $btnPageNext.classList.add(wrap_class("footer-btn"));
  $btnPageNext.appendChild(arrowRightSVG(namespace));
  $btnPageNext.onclick = function on_click_btn_page_next() {
    if (readonly) return;
    new_page_index_callback(page_index + 1);
  };
  $pageJumps.appendChild($btnPageNext);

  const $pageNumber = h("div");
  set_class($pageNumber, "page-number");

  const $pageNumberInput = h("input");
  set_class($pageNumberInput, "page-number-input");
  $pageNumberInput.value = String(page_index + 1);
  $pageNumberInput.onchange = function on_change_page_number_input() {
    if (readonly) return;
    if ($pageNumberInput.value) {
      new_page_index_callback(Number($pageNumberInput.value) - 1);
    }
  };

  const $totalPage = h("span");
  set_class($totalPage, "total-page");
  $totalPage.textContent = " / ";

  $pageNumber.appendChild($pageNumberInput);
  $pageNumber.appendChild($totalPage);

  $footer.appendChild($pageJumps);
  $footer.appendChild($pageNumber);

  const class_readonly = wrap_class("readonly");

  function set_readonly(readonly_: boolean) {
    if (readonly !== readonly_) {
      readonly = readonly_;
      $footer.classList.toggle(class_readonly, readonly);
      $pageNumberInput.disabled = readonly;
    }
  }

  function set_sidebar(sidebar_: boolean) {
    if (sidebar !== sidebar_) {
      sidebar = sidebar_;
      $btnSidebar.style.display = sidebar ? "" : "none";
    }
  }

  function set_page_index(page_index_: number, force = false) {
    if (force || page_index !== page_index_) {
      page_index = page_index_;
      $pageNumberInput.value = String(page_index + 1);
    }
  }

  function set_page_count(page_count_: number) {
    if (page_count !== page_count_) {
      page_count = page_count_;
      $totalPage.textContent = ` / ${page_count}`;
    }
  }

  return {
    $footer,
    $pageNumberInput,
    set_readonly,
    set_sidebar,
    set_page_index,
    set_page_count,
    on_new_page_index,
    on_toggle_preview,
    on_play,
  };
}

function create_slide_wrapper() {
  const $slide = h("div");
  set_class($slide, "slide");
  return $slide;
}

function on_visibility_change(callback: (visible: boolean) => void) {
  if (typeof document !== "undefined") {
    const listener = () => callback(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }
  return noop;
}

export type SlideViewerOptions = Omit<ISlideConfig, "anchor" | "mode" | "interactive"> & {
  mode?: ISlideConfig["mode"];
  interactive?: ISlideConfig["interactive"];
} & SlideAttributes;

export interface SlideViewerInfoResponse {
  width: number;
  height: number;
  slideCount: number;
}

export class SlideViewer {
  static styles = styles;
  static fetchSlideInfo = fetch_slide_info;

  private readonly sideEffect = new SideEffectManager();

  readonly $slide = create_slide_wrapper();
  readonly sidebar = create_sidebar();
  readonly footer = create_footer();
  readonly $content: HTMLElement;
  readonly $footer: HTMLElement;
  readonly $overlay: HTMLElement;

  readonly slide;

  private readonly _readyPromise: Promise<void>;
  private readonly _infoPromise: Promise<SlideViewerInfoResponse>;
  private _ready = false;
  private _slideCount = 0;
  private _destroyed = false;

  constructor(options: SlideViewerOptions) {
    this.$content = this.sidebar.$content;
    this.$footer = this.footer.$footer;
    append(this.$content, this.$slide);
    this.$overlay = h("div");
    set_class(this.$overlay, "overlay");
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
      resize: true,
      mode: "local",
      interactive: true,
      enableGlobalClick: true,
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
  }

  unfreeze() {
    if (this._destroyed) return;
    this._isFrozen = false;
    if (!this._ready) return;
    this.slide.release();
  }
}
