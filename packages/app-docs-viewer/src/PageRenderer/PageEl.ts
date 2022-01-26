import type { DocsViewerPage } from "../DocsViewer";

export class PageEl {
  index: number;
  page: DocsViewerPage;
  scale = 1;

  lastVisit = Date.now();
  $page: HTMLDivElement;
  pageOffsetY = 0;
  pageOffsetX = 0;
  visible = true;

  constructor(index: number, page: DocsViewerPage, scale: number, pagesIntrinsicWidth: number) {
    this.index = index;
    this.page = page;
    this.scale = scale;
    this.pageOffsetX = (pagesIntrinsicWidth - page.width) / 2;

    const $page = document.createElement("div");
    $page.className = "page-renderer-page";
    $page.dataset.index = `${index}`;
    $page.style.width = `${page.width * scale}px`;
    $page.style.height = `${page.height * scale}px`;
    if (page.thumbnail) {
      $page.style.backgroundImage = `url("${page.thumbnail}")`;
    }

    const $img = document.createElement("img");
    $img.className = "page-renderer-page-img";
    $img.width = page.width;
    $img.height = page.height;
    $img.src = page.src;

    $page.appendChild($img);

    this.$page = $page;
  }

  translateY(pageOffsetY: number): void {
    if (Math.abs(pageOffsetY - this.pageOffsetY) >= 0.001) {
      this.pageOffsetY = pageOffsetY;
      this.$page.style.transform = `translate(${this.pageOffsetX * this.scale}px, ${
        this.pageOffsetY * this.scale
      }px)`;
    }
  }

  setScale(scale: number): void {
    if (Math.abs(scale - this.scale) >= 0.001) {
      this.scale = scale;
      this.$page.style.width = `${this.page.width * this.scale}px`;
      this.$page.style.height = `${this.page.height * this.scale}px`;
      this.$page.style.transform = `translate(${this.pageOffsetX * this.scale}px, ${
        this.pageOffsetY * this.scale
      }px)`;
    }
  }

  setVisible(visible: boolean): void {
    if (visible !== this.visible) {
      this.visible = visible;
      this.$page.style.opacity = visible ? "1" : "0";
    }
  }
}
