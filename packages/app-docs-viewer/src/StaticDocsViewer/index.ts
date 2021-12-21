import type { AnimationMode, ReadonlyTeleBox } from "@netless/window-manager";
import type { View, Size, Camera } from "white-web-sdk";
import LazyLoad from "vanilla-lazyload";
import type { DebouncedFunction, Options } from "debounce-fn";
import debounceFn from "debounce-fn";
import { SideEffectManager } from "side-effect-manager";
import type { DocsViewerPage } from "../DocsViewer";
import { DocsViewer } from "../DocsViewer";
import { clamp, flattenEvent, preventEvent } from "../utils/helpers";

const SCROLLBAR_MIN_HEIGHT = 30;

const RATIO_BASE_CONTAINER_HEIGHT = 640;

export interface StaticDocsViewerConfig {
  whiteboardView: View;
  readonly: boolean;
  box: ReadonlyTeleBox;
  pages: DocsViewerPage[];
  pagesSize: { width: number; height: number };
  mountWhiteboard: (dom: HTMLDivElement) => void;
  /** Scroll Top of the original page */
  pageScrollTop?: number;
  onUserScroll?: (pageScrollTop: number) => void;
}

export class StaticDocsViewer {
  public constructor({
    whiteboardView,
    readonly,
    box,
    pages,
    pagesSize,
    pageScrollTop = 0,
    mountWhiteboard,
    onUserScroll,
  }: StaticDocsViewerConfig) {
    this.whiteboardView = whiteboardView;
    this.readonly = readonly;
    this.box = box;
    this.pages = pages;
    this.pageScrollTop = pageScrollTop;
    this.pagesSize = pagesSize;
    this.mountWhiteboard = mountWhiteboard;
    this.onUserScroll = onUserScroll;

    this.viewer = new DocsViewer({
      readonly,
      box,
      pages,
      onNewPageIndex: this.onNewPageIndex,
    });

    this.render();
  }

  protected readonly: boolean;
  protected pages: DocsViewerPage[];
  protected box: ReadonlyTeleBox;
  protected whiteboardView: View;
  protected mountWhiteboard: (dom: HTMLDivElement) => void;

  public pageScrollTop: number;
  public pagesSize: { width: number; height: number };
  public onUserScroll?: (pageScrollTop: number) => void;

  public viewer: DocsViewer;

  public $pages!: HTMLElement;
  public $whiteboardView!: HTMLDivElement;
  public $scrollbar!: HTMLElement;

  public mount(): this {
    this.viewer.mount();

    this.sideEffect.add(() => {
      const contentLazyLoad = new LazyLoad({
        container: this.$pages,
        elements_selector: `.${this.wrapClassName("page")}`,
      });
      return () => contentLazyLoad.destroy();
    }, "page-lazyload");

    this.setupWhiteboardCamera();

    this.sideEffect.setTimeout(() => {
      if (this.pageScrollTop !== 0) {
        this.pageScrollTo(this.pageScrollTop);
      }
    }, 1000);

    // add event listener after scrollTop is set
    this.setupScrollTopEvent();

    this.sideEffect.add(() => {
      const handler = this.renderRatioHeight.bind(this);
      this.box.events.on("visual_resize", handler);
      return () => this.box.events.off("visual_resize", handler);
    });

    return this;
  }

  public unmount(): this {
    this.viewer.unmount();
    return this;
  }

  public setReadonly(readonly: boolean): void {
    if (this.readonly !== readonly) {
      this.readonly = readonly;
      this.viewer.setReadonly(readonly);
    }
  }

  public destroy(): void {
    this.sideEffect.flushAll();
    this.onUserScroll = void 0;
    this.unmount();
    this.viewer.destroy();
  }

  /** Sync scrollTop from writable user */
  public syncPageScrollTop(pageScrollTop: number): void {
    if (pageScrollTop >= 0 && Math.abs(this.pageScrollTop - pageScrollTop) > 10) {
      this.pageScrollTo(pageScrollTop);
    }
  }

  public render(): void {
    this.viewer.$content.appendChild(this.renderPages());
    this.viewer.$content.appendChild(this.renderWhiteboardView());
    this.viewer.$content.appendChild(this.renderScrollbar());
    this.renderRatioHeight();
  }

  protected renderRatioHeight(): void {
    const boxHeight = this.box.absoluteHeight;
    const isSmallBox = boxHeight <= RATIO_BASE_CONTAINER_HEIGHT;

    this.viewer.setSmallBox(isSmallBox);

    if (isSmallBox) {
      const titleBarSupposedHeight = 26 / RATIO_BASE_CONTAINER_HEIGHT;
      const titleBarActualHeight = 26 / boxHeight;
      const footerSupposedHeight = 26 / RATIO_BASE_CONTAINER_HEIGHT;
      const footerActualHeight = 0;

      const emptySpace = Math.max(
        (titleBarSupposedHeight +
          footerSupposedHeight -
          (titleBarActualHeight + footerActualHeight)) /
          2,
        0
      );

      if (this.box.$titleBar) {
        const titleBarHeight = titleBarActualHeight + emptySpace;
        this.box.$titleBar.style.height = `${titleBarHeight * 100}%`;
      }

      if (this.box.$footer) {
        const footerHeight = footerActualHeight + emptySpace;
        this.box.$footer.style.height = `${footerHeight * 100}%`;
      }
    } else {
      if (this.box.$titleBar) {
        const titleBarHeight = Math.max(26 / RATIO_BASE_CONTAINER_HEIGHT, 26 / boxHeight);
        this.box.$titleBar.style.height = `${titleBarHeight * 100}%`;
      }

      if (this.box.$footer) {
        const footerHeight = Math.max(26 / RATIO_BASE_CONTAINER_HEIGHT, 26 / boxHeight);
        this.box.$footer.style.height = `${footerHeight * 100}%`;
      }
    }
  }

  protected renderPages(): HTMLElement {
    if (!this.$pages) {
      const $pages = document.createElement("div");
      $pages.className = this.wrapClassName("pages");
      this.$pages = $pages;

      const pageClassName = this.wrapClassName("page");
      this.pages.forEach((page, i) => {
        const $img = document.createElement("img");
        $img.className = pageClassName + " " + this.wrapClassName(`page-${i}`);
        $img.draggable = false;
        $img.width = page.width;
        $img.height = page.height;
        $img.dataset.src = page.src;
        $img.dataset.pageIndex = String(i);

        $pages.appendChild($img);
      });
    }
    return this.$pages;
  }

  protected renderWhiteboardView(): HTMLDivElement {
    if (!this.$whiteboardView) {
      this.$whiteboardView = document.createElement("div");
      this.$whiteboardView.className = this.wrapClassName("wb-view");
      this.mountWhiteboard(this.$whiteboardView);
      this.sideEffect.addEventListener(
        this.$whiteboardView,
        "wheel",
        ev => {
          preventEvent(ev);
          if (!this.readonly) {
            this.pageScrollTo(this.pageScrollTop + ev.deltaY);
            this.updateUserScroll();
          }
        },
        { passive: false, capture: true }
      );
      this.sideEffect.addEventListener(
        this.$whiteboardView,
        "touchmove",
        ev => {
          if (this.readonly || ev.touches.length <= 1) {
            return;
          }
          this.updateUserScroll();
        },
        { passive: true, capture: true }
      );
    }
    return this.$whiteboardView;
  }

  protected renderScrollbar(): HTMLElement {
    if (!this.$scrollbar) {
      const $scrollbar = document.createElement("button");
      this.$scrollbar = $scrollbar;
      $scrollbar.className = this.wrapClassName("scrollbar");
      $scrollbar.style.minHeight = `${SCROLLBAR_MIN_HEIGHT}px`;

      const trackStart = (ev: MouseEvent | TouchEvent): void => {
        if (this.readonly) {
          return;
        }

        if ((ev as MouseEvent).button != null && (ev as MouseEvent).button !== 0) {
          // Not left mouse
          return;
        }

        preventEvent(ev);

        this.$scrollbar.classList.toggle(this.wrapClassName("scrollbar-dragging"), true);

        const startTop = this.scrollTopPageToEl(this.pageScrollTop);
        const elScrollHeight =
          (this.whiteboardView.size.width / this.pagesSize.width) * this.pagesSize.height;
        const { clientY: startY } = flattenEvent(ev);

        const tracking = (ev: MouseEvent | TouchEvent): void => {
          const { clientY } = flattenEvent(ev);
          const { height: wbHeight } = this.whiteboardView.size;
          this.elScrollTo(startTop + (clientY - startY) * (elScrollHeight / wbHeight));
        };

        const trackEnd = (): void => {
          this.$scrollbar.classList.toggle(this.wrapClassName("scrollbar-dragging"), false);
          window.removeEventListener("mousemove", tracking, true);
          window.removeEventListener("touchmove", tracking, true);
          window.removeEventListener("mouseup", trackEnd, true);
          window.removeEventListener("touchend", trackEnd, true);
          window.removeEventListener("touchcancel", trackEnd, true);
        };

        window.addEventListener("mousemove", tracking, true);
        window.addEventListener("touchmove", tracking, true);
        window.addEventListener("mouseup", trackEnd, true);
        window.addEventListener("touchend", trackEnd, true);
        window.addEventListener("touchcancel", trackEnd, true);
      };
      this.sideEffect.addEventListener($scrollbar, "mousedown", trackStart);
      this.sideEffect.addEventListener($scrollbar, "touchstart", trackStart);
    }
    return this.$scrollbar;
  }

  protected scrollTopPageToEl(pageScrollTop: number): number {
    return pageScrollTop * (this.whiteboardView.size.width / this.pagesSize.width);
  }

  protected scrollTopElToPage(elScrollTop: number): number {
    return elScrollTop / (this.whiteboardView.size.width / this.pagesSize.width);
  }

  /** Scroll base on DOM rect */
  protected elScrollTo(elScrollTop: number): void {
    this.pageScrollTo(this.scrollTopElToPage(elScrollTop));
  }

  /** Scroll base on docs size */
  protected pageScrollTo(pageScrollTop: number): void {
    const halfWbHeight = this.scrollTopElToPage(this.whiteboardView.size.height / 2);
    this.whiteboardView.moveCamera({
      centerY: clamp(
        pageScrollTop + halfWbHeight,
        halfWbHeight,
        this.pagesSize.height - halfWbHeight
      ),
      animationMode: "immediately" as AnimationMode,
    });
  }

  protected scrollToPage(index: number): void {
    if (!this.readonly && this.$pages && !Number.isNaN(index)) {
      index = clamp(index, 0, this.pages.length - 1);
      const $page = this.$pages.querySelector<HTMLElement>(
        "." + this.wrapClassName(`page-${index}`)
      );
      if ($page) {
        const elOffsetTop = $page.offsetTop + 5;
        this.elScrollTo(elOffsetTop);
        this.updateUserScroll();
      }
    }
  }

  protected setupScrollTopEvent(): void {
    const updatePageIndex = this.debounce(
      () => {
        if (this.pages.length > 0 && this.$pages) {
          const pagesWidth = this.$pages.getBoundingClientRect().width;
          if (pagesWidth > 0) {
            let pageTop = 0;
            for (let i = 0; i < this.pages.length; i += 1) {
              pageTop += this.pages[i].height;
              if (this.pageScrollTop <= pageTop) {
                this.viewer.setPageIndex(i);
                return;
              }
            }
            this.viewer.setPageIndex(this.pages.length - 1);
          }
        }
      },
      { wait: 5, maxWait: 100 },
      "debounce-updatePageIndex"
    );

    this.sideEffect.add(() => {
      const handleCameraUpdate = (camera: Camera) => {
        const { width: wbWidth, height: wbHeight } = this.whiteboardView.size;
        const { width: pageWidth, height: pageHeight } = this.pagesSize;
        const elScrollHeight = (wbWidth / pageWidth) * pageHeight;

        const elScrollTop = this.scrollTopPageToEl(camera.centerY) - wbHeight / 2;
        const pageScrollTop = this.scrollTopElToPage(elScrollTop);
        this.pageScrollTop = pageScrollTop;

        this.$pages.scrollTo({ top: elScrollTop });

        this.setScrollbarHeight((wbHeight / elScrollHeight) * wbHeight);
        this.$scrollbar.style.transform = `translateY(${
          (elScrollTop / (elScrollHeight - wbHeight)) * (wbHeight - this.scrollbarHeight)
        }px)`;

        updatePageIndex();
      };
      this.whiteboardView.callbacks.on("onCameraUpdated", handleCameraUpdate);
      return () => this.whiteboardView.callbacks.off("onCameraUpdated", handleCameraUpdate);
    });
  }

  protected setupWhiteboardCamera(): void {
    this.sideEffect.add(() => {
      const handleSizeUpdate = ({ width, height }: Size): void => {
        if (width > 0 && height > 0) {
          const elScrollTop = this.$pages.scrollTop;
          const pageWidth = this.pagesSize.width;
          const ratio = pageWidth / width;
          this.whiteboardView.moveCameraToContain({
            originX: 0,
            originY: elScrollTop * ratio,
            width: pageWidth,
            height: height * ratio,
            animationMode: "immediately" as AnimationMode,
          });
          this.whiteboardView.setCameraBound({
            damping: 1,
            maxContentMode: () => width / pageWidth,
            minContentMode: () => width / pageWidth,
            centerX: this.pagesSize.width / 2,
            centerY: this.pagesSize.height / 2,
            width: this.pagesSize.width,
            height: this.pagesSize.height,
          });
          this.elScrollTo(elScrollTop);
        }
      };
      this.whiteboardView.callbacks.on("onSizeUpdated", handleSizeUpdate);
      return () => {
        this.whiteboardView.callbacks.off("onSizeUpdated", handleSizeUpdate);
      };
    }, "whiteboard-size-update");
  }

  protected updateUserScroll(): void {
    window.requestAnimationFrame(() => {
      if (this.onUserScroll) {
        this.onUserScroll(this.pageScrollTop);
      }
    });
  }

  protected debounce<ArgumentsType extends unknown[], ReturnType>(
    fn: (...args: ArgumentsType) => ReturnType,
    options: Options,
    disposerID?: string
  ): DebouncedFunction<ArgumentsType, ReturnType | undefined> {
    const dFn = debounceFn(fn, options);
    this.sideEffect.add(() => () => dFn.cancel(), disposerID);
    return dFn;
  }

  protected wrapClassName(className: string): string {
    return "netless-app-docs-viewer-static-" + className;
  }

  protected onNewPageIndex = (index: number): void => {
    this.scrollToPage(index);
  };

  protected sideEffect = new SideEffectManager();

  protected scrollbarHeight = SCROLLBAR_MIN_HEIGHT;

  protected setScrollbarHeight(elScrollbarHeight: number): void {
    elScrollbarHeight = clamp(
      elScrollbarHeight,
      SCROLLBAR_MIN_HEIGHT,
      this.whiteboardView.size.height
    );
    if (this.scrollbarHeight !== elScrollbarHeight) {
      this.scrollbarHeight = elScrollbarHeight;
      this.$scrollbar.style.height = `${elScrollbarHeight}px`;
    }
  }
}
