import type { ReadonlyVal } from "value-enhancer";
import type { DocsViewerPage } from "../DocsViewer";
import { PageEl } from "./PageEl";

export class PageElManager {
  els = new Map<number, PageEl>();

  private maxElCount = 200;
  private gcTimer: number | null = null;

  constructor(
    private pages$: ReadonlyVal<DocsViewerPage[]>,
    private pagesSize$: ReadonlyVal<{ width: number; height: number }>,
    private scale$: ReadonlyVal<number>,
    private pagesYs$: ReadonlyVal<number[]>,
    private pagesScrollTop$: ReadonlyVal<number>
  ) {
    this.schedule =
      window.requestIdleCallback || ((handler: () => void) => window.setTimeout(handler, 5000));

    this.cancelSchedule = window.cancelIdleCallback || window.clearTimeout;
  }

  getEl(index: number): PageEl {
    let el = this.els.get(index);
    if (!el) {
      el = new PageEl(
        index,
        this.pages$,
        this.pagesSize$,
        this.scale$,
        this.pagesYs$,
        this.pagesScrollTop$
      );
      this.els.set(index, el);
    }
    el.lastVisit = Date.now();

    if (this.els.size > this.maxElCount && this.gcTimer === null) {
      this.gcTimer = this.schedule(this.gc);
    }

    return el;
  }

  destroy() {
    this.els.forEach(el => el.destroy());
    this.els.clear();
    if (this.gcTimer !== null) {
      this.cancelSchedule(this.gcTimer);
      this.gcTimer = null;
    }
  }

  private schedule: (handler: () => void) => number;
  private cancelSchedule: (handle: number) => void;

  private gc = () => {
    this.gcTimer = null;

    if (this.els.size > this.maxElCount) {
      const sortedEls = [...this.els.values()].sort((x, y) => y.lastVisit - x.lastVisit);
      for (let i = Math.floor(this.maxElCount / 4); i < sortedEls.length; i++) {
        this.els.get(sortedEls[i].index)?.destroy();
        this.els.delete(sortedEls[i].index);
      }
    }
  };
}
