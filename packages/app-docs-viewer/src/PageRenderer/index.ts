import type { DocsViewerPage } from "../DocsViewer";
import { PageElManager } from "./PageElManager";
import { clamp } from "../utils/helpers";

export interface PageRendererConfig {
  pagesScrollTop?: number;
  containerWidth: number;
  containerHeight: number;
  pages: ReadonlyArray<DocsViewerPage>;
  onPageIndexChanged?: (index: number) => void;
}

/**
 * High-performance renderer for large number of page images
 */
export class PageRenderer {
  readonly $pages: HTMLDivElement;

  readonly pages: ReadonlyArray<DocsViewerPage>;
  readonly pagesIntrinsicYs: ReadonlyArray<number>;
  readonly pagesIntrinsicWidth: number;
  readonly pagesIntrinsicHeight: number;
  readonly pagesMinHeight: number;

  readonly pageElManager: PageElManager;

  containerWidth: number;
  containerHeight: number;

  threshold: number;
  scale: number;
  pagesScrollTop: number;
  pageScrollIndex: number;
  onPageIndexChanged?: (index: number) => void;

  constructor(config: PageRendererConfig) {
    this.pagesScrollTop = config.pagesScrollTop || 0;
    this.containerWidth = config.containerWidth || 1;
    this.containerHeight = config.containerHeight || 1;
    this.pages = config.pages.map(page => {
      if (page.thumbnail) {
        return page;
      }
      try {
        const url = new URL(page.src);
        url.searchParams.set("x-oss-process", "image/resize,l_50");
        return { ...page, thumbnail: url.toString() };
      } catch (e) {
        console.error(e);
        return page;
      }
    });

    const pagesIntrinsicYs = Array(this.pages.length);
    let pagesMinHeight = Infinity;
    let pagesIntrinsicWidth = 0;
    this.pagesIntrinsicHeight = this.pages.reduce((pageY, page, i) => {
      pagesIntrinsicYs[i] = pageY;
      if (page.width > pagesIntrinsicWidth) {
        pagesIntrinsicWidth = page.width;
      }
      if (page.height <= pagesMinHeight) {
        pagesMinHeight = page.height;
      }
      return pageY + page.height;
    }, 0);
    this.pagesIntrinsicWidth = pagesIntrinsicWidth;
    this.pagesMinHeight = pagesMinHeight;
    this.pagesIntrinsicYs = pagesIntrinsicYs;

    this.scale = this._calcScale();
    this.threshold = this._calcThreshold();

    this.onPageIndexChanged = config.onPageIndexChanged;
    this.pageScrollIndex = 0;
    if (this.pagesScrollTop !== 0) {
      this.pageScrollIndex = this.findScrollPageIndex();
      if (this.onPageIndexChanged && this.pageScrollIndex > 0) {
        this.onPageIndexChanged(this.pageScrollIndex);
      }
    }

    this.pageElManager = new PageElManager(this.pages, pagesIntrinsicWidth, this.scale);

    this.$pages = this.renderPages();
  }

  setContainerSize(width: number, height: number): void {
    if (width > 0 && height > 0) {
      if (width !== this.containerWidth || height !== this.containerHeight) {
        this.containerWidth = width;
        this.containerHeight = height;

        this.$pages.style.width = `${this.containerWidth}px`;
        this.$pages.style.height = `${this.containerHeight}px`;

        this.scale = this._calcScale();
        this.threshold = this._calcThreshold();

        this.pageElManager.setScale(this.scale);

        if (this.$pages.parentElement) {
          this.pagesScrollTo(this.pagesScrollTop, true);
        }
      }
    }
  }

  renderPages(): HTMLDivElement {
    const $pages = document.createElement("div");
    $pages.className = "page-renderer-pages-container";
    $pages.style.width = `${this.containerWidth}px`;
    $pages.style.height = `${this.containerHeight}px`;
    return $pages;
  }

  pagesScrollTo(pagesScrollTop: number, force?: boolean): void {
    pagesScrollTop = clamp(
      pagesScrollTop,
      0,
      this.pagesIntrinsicHeight - this.containerHeight / this.scale
    );

    if (force || Math.abs(pagesScrollTop - this.pagesScrollTop) >= 0.001) {
      this._turnOnHWA();

      this.pagesScrollTop = pagesScrollTop;

      const pageScrollIndex = this.findScrollPageIndex();
      const startIndex = Math.max(pageScrollIndex - this.threshold, 0);
      const endIndex = Math.min(pageScrollIndex + this.threshold, this.pages.length - 1);

      for (let i = 0; i < this.$pages.children.length; i++) {
        const $page = this.$pages.children[i] as HTMLDivElement;
        const index = Number($page.dataset.index);
        if (!(index >= startIndex && index <= endIndex)) {
          $page.remove();
          i--;
        }
      }

      for (let i = startIndex; i <= endIndex; i++) {
        const pageEl = this.pageElManager.getEl(i);
        if (pageEl.$page.parentElement !== this.$pages) {
          this.$pages.appendChild(pageEl.$page);
        }
        pageEl.translateY(this.pagesIntrinsicYs[i] - this.pagesScrollTop);
      }

      if (pageScrollIndex !== this.pageScrollIndex) {
        this.pageScrollIndex = pageScrollIndex;
        if (this.onPageIndexChanged) {
          this.onPageIndexChanged(pageScrollIndex);
        }
      }
    }
  }

  findScrollPageIndex() {
    for (let i = 0; i < this.pagesIntrinsicYs.length; i++) {
      if (this.pagesIntrinsicYs[i] + this.pages[i].height - this.pagesScrollTop >= 0.001) {
        return i;
      }
    }
    return this.pagesIntrinsicYs.length - 1;
  }

  mount($parent: HTMLElement): void {
    $parent.appendChild(this.$pages);
    this.pagesScrollTo(this.pagesScrollTop, true);
  }

  unmount(): void {
    this.$pages.remove();
  }

  destroy() {
    this.unmount();
    this.onPageIndexChanged = void 0;
    this.pageElManager.destroy();
    if (this._hwaTimeout) {
      window.clearTimeout(this._hwaTimeout);
      this._hwaTimeout = NaN;
    }
  }

  private _calcScale(): number {
    return this.containerWidth / this.pagesIntrinsicWidth || 1;
  }

  private _calcThreshold(): number {
    return clamp(
      Math.ceil(this.containerHeight / this.scale / this.pagesMinHeight / 2),
      1,
      this.pages.length
    );
  }

  private _hwaTimeout = NaN;
  /** Hardware Acceleration */
  private _turnOnHWA(): void {
    if (this._hwaTimeout) {
      window.clearTimeout(this._hwaTimeout);
    } else {
      this.$pages.classList.toggle("is-hwa", true);
    }
    this._hwaTimeout = window.setTimeout(this._turnOffHWA, 1000);
  }
  private _turnOffHWA = (): void => {
    window.clearTimeout(this._hwaTimeout);
    this._hwaTimeout = NaN;
    this.$pages.classList.toggle("is-hwa", false);
  };
}
