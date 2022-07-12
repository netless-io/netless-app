import { SideEffectManager } from "side-effect-manager";
import { combine, derive, type ReadonlyVal } from "value-enhancer";
import type { DocsViewerPage } from "../DocsViewer";

export class PageEl {
  lastVisit = Date.now();
  $page: HTMLDivElement;
  private sideEffect = new SideEffectManager();

  constructor(
    public readonly index: number,
    pages$: ReadonlyVal<DocsViewerPage[]>,
    pagesSize$: ReadonlyVal<{ width: number; height: number }>,
    scale$: ReadonlyVal<number>,
    pagesYs$: ReadonlyVal<number[]>,
    pagesScrollTop$: ReadonlyVal<number>
  ) {
    const page$ = derive(pages$, pages => pages[index] || { width: 0, height: 0 });

    const pageOffsetX$ = combine(
      [page$, pagesSize$],
      ([page, pagesSize]) => (pagesSize.width - page.width) / 2
    );

    const pageOffsetY$ = combine(
      [pagesYs$, pagesScrollTop$],
      ([pagesYs, pagesScrollTop]) => (pagesYs[index] || 0) - pagesScrollTop
    );

    const $page = document.createElement("div");
    $page.className = "page-renderer-page";
    $page.dataset.index = `${index}`;

    const $img = document.createElement("img");
    $img.className = "page-renderer-page-img";
    $page.appendChild($img);

    this.sideEffect.addDisposer([
      combine([page$, scale$]).subscribe(([page, scale]) => {
        $page.style.width = `${page.width * scale}px`;
        $page.style.height = `${page.height * scale}px`;
      }),
      page$.subscribe(page => {
        if (page.thumbnail) {
          $page.style.backgroundImage = `url("${page.thumbnail}")`;
        }
        $img.width = page.width;
        $img.height = page.height;
        $img.src = page.src;
      }),
      combine([pageOffsetX$, pageOffsetY$, scale$]).subscribe(
        ([pageOffsetX, pageOffsetY, scale]) => {
          $page.style.transform = `translate(${pageOffsetX * scale}px, ${pageOffsetY * scale}px)`;
        }
      ),
    ]);

    this.$page = $page;
  }

  destroy(): void {
    this.sideEffect.flushAll();
    this.$page.remove();
  }
}
