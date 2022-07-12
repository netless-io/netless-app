import type { DocsViewerPage } from "../DocsViewer";
import { PageElManager } from "./PageElManager";
import { clamp } from "../utils/helpers";
import {
  combine,
  derive,
  Val,
  withReadonlyValueEnhancer,
  type ReadonlyVal,
  type ReadonlyValEnhancedResult,
} from "value-enhancer";
import type { TeleBoxRect } from "@netless/window-manager";
import { SideEffectManager } from "side-effect-manager";

export interface PageRendererConfig {
  pagesScrollTop$: ReadonlyVal<number>;
  containerRect$: ReadonlyVal<TeleBoxRect>;
  pages$: ReadonlyVal<DocsViewerPage[]>;
  pagesSize$: ReadonlyVal<{ width: number; height: number }>;
}

export type ReadonlyValConfig = {
  pagesScrollTop: PageRendererConfig["pagesScrollTop$"];
  containerRect: PageRendererConfig["containerRect$"];
  pages: PageRendererConfig["pages$"];
  pagesSize: PageRendererConfig["pagesSize$"];
  pagesIndex: ReadonlyVal<number>;
  pagesYs: ReadonlyVal<number[]>;
  pagesMinHeight: ReadonlyVal<number>;
  /** containerRect.width / pagesSize.width, (el / intrinsic) */
  scale: ReadonlyVal<number>;
};

export interface PageRenderer extends ReadonlyValEnhancedResult<ReadonlyValConfig> {}

/**
 * High-performance renderer for large number of page images
 */
export class PageRenderer {
  readonly $pages: HTMLDivElement;

  private readonly sideEffect = new SideEffectManager();

  readonly pageElManager: PageElManager;

  constructor({ pagesScrollTop$, containerRect$, pages$, pagesSize$ }: PageRendererConfig) {
    pages$ = derive(pages$, pages =>
      pages.map(page => {
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
      })
    );

    const pagesYs$ = derive(pages$, pages => {
      const pagesYs = Array(pages.length);
      for (let i = 0; i < pages.length; i++) {
        pagesYs[i] = i > 0 ? pagesYs[i - 1] + pages[i - 1].height : 0;
      }
      return pagesYs;
    });

    const pagesMinHeight$ = derive(pages$, pages => {
      let pagesMinHeight = Infinity;
      for (let i = pages.length - 1; i >= 0; i--) {
        if (pages[i].height <= pagesMinHeight) {
          pagesMinHeight = pages[i].height;
        }
      }
      return pagesMinHeight;
    });

    const pagesIndex$ = combine(
      [pagesScrollTop$, pagesYs$, pages$],
      ([pagesScrollTop, pagesYs, pages]) => {
        for (let i = 0; i < pagesYs.length; i++) {
          if (pagesYs[i] + pages[i].height - pagesScrollTop >= 0.001) {
            return i;
          }
        }
        return pagesYs.length - 1;
      }
    );

    const scale$ = combine(
      [containerRect$, pagesSize$],
      ([containerRect, pagesSize]) => containerRect.width / pagesSize.width || 1
    );

    const threshold$ = combine(
      [pages$, containerRect$, pagesMinHeight$, scale$],
      ([pages, containerRect, pagesMinHeight, scale]) =>
        clamp(Math.ceil(containerRect.height / scale / pagesMinHeight / 2), 1, pages.length)
    );

    withReadonlyValueEnhancer(this, {
      pagesScrollTop: pagesScrollTop$,
      containerRect: containerRect$,
      pages: pages$,
      pagesSize: pagesSize$,
      pagesIndex: pagesIndex$,
      pagesYs: pagesYs$,
      pagesMinHeight: pagesMinHeight$,
      scale: scale$,
    });

    this.pageElManager = new PageElManager(pages$, pagesSize$, scale$, pagesYs$, pagesScrollTop$);

    this.$pages = this.renderPages();

    /** Hardware Acceleration */
    const isHWAOn$ = new Val(false);
    this.sideEffect.addDisposer(
      isHWAOn$.subscribe(isHWAOn => this.$pages.classList.toggle("is-hwa", isHWAOn))
    );
    const turnOffHWA = () => isHWAOn$.setValue(false);
    const turnOnHWA = () => {
      this.sideEffect.setTimeout(turnOffHWA, 1000, "turn-off-hwa");
      isHWAOn$.setValue(true);
    };

    this.sideEffect.addDisposer(
      combine([pagesIndex$, threshold$, pages$]).subscribe(([pagesIndex, threshold, pages]) => {
        turnOnHWA();

        const startIndex = Math.max(pagesIndex - threshold, 0);
        const endIndex = Math.min(pagesIndex + threshold, pages.length - 1);

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
        }
      })
    );
  }

  renderPages(): HTMLDivElement {
    const $pages = document.createElement("div");
    $pages.className = "page-renderer-pages-container";
    this.sideEffect.addDisposer(
      this._containerRect$.subscribe(containerRect => {
        $pages.style.width = `${containerRect.width}px`;
        $pages.style.height = `${containerRect.height}px`;
      }),
      "render-pages-size"
    );
    return $pages;
  }

  destroy() {
    this.sideEffect.flushAll();
    this.$pages.remove();
    this.pageElManager.destroy();
  }
}
