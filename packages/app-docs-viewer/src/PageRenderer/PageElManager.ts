import type { DocsViewerPage } from "../DocsViewer";
import { PageEl } from "./PageEl";

const schedule: (handler: () => void) => number =
  window.requestIdleCallback || ((handler: () => void) => window.setTimeout(handler, 5000));

const cancelSchedule = window.cancelIdleCallback || window.clearTimeout;

export class PageElManager {
  els = new Map<number, PageEl>();

  private maxElCount = 200;
  private gcTimer: number | null = null;

  constructor(
    private pages: ReadonlyArray<DocsViewerPage>,
    private pagesIntrinsicWidth: number,
    private scale: number
  ) {}

  getEl(index: number): PageEl {
    let el = this.els.get(index);
    if (!el) {
      el = new PageEl(index, this.pages[index], this.scale, this.pagesIntrinsicWidth);
      this.els.set(index, el);
    }
    el.lastVisit = Date.now();

    if (this.els.size > this.maxElCount && this.gcTimer === null) {
      this.gcTimer = schedule(this.gc);
    }

    return el;
  }

  setScale(scale: number): void {
    if (scale !== this.scale) {
      this.scale = scale;
      this.els.forEach(pageEl => pageEl.setScale(scale));
    }
  }

  destroy() {
    this.els.clear();
    if (this.gcTimer !== null) {
      cancelSchedule(this.gcTimer);
      this.gcTimer = null;
    }
  }

  private gc = () => {
    this.gcTimer = null;

    if (this.els.size > this.maxElCount) {
      const sortedEls = [...this.els.values()].sort((x, y) => y.lastVisit - x.lastVisit);
      for (let i = Math.floor(this.maxElCount / 4); i < sortedEls.length; i++) {
        this.els.delete(sortedEls[i].index);
      }
    }
  };
}
