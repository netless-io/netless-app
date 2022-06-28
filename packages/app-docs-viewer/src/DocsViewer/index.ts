import { sidebarSVG } from "./icons/sidebar";
import { arrowLeftSVG } from "./icons/arrow-left";
import { arrowRightSVG } from "./icons/arrow-right";
import { playSVG } from "./icons/play";
import { pauseSVG } from "./icons/pause";

import type { ReadonlyTeleBox } from "@netless/window-manager";
import LazyLoad from "vanilla-lazyload";
import { SideEffectManager } from "side-effect-manager";
import { Val, withValueEnhancer, type ValEnhancedResult } from "value-enhancer";

export interface DocsViewerPage {
  src: string;
  height: number;
  width: number;
  thumbnail?: string;
}

export interface DocsViewerConfig {
  readonly: boolean;
  box: ReadonlyTeleBox;
  pages: DocsViewerPage[];
  onPlay?: () => void;
}

type ValConfig = {
  readonly: Val<boolean>;
  pageIndex: Val<number, boolean>;
  isShowPreview: Val<boolean>;
  isSmallBox: Val<boolean>;
};

export interface DocsViewer extends ValEnhancedResult<ValConfig> {}

export class DocsViewer {
  public constructor({ readonly, box, pages, onPlay }: DocsViewerConfig) {
    if (pages.length <= 0) {
      throw new Error("[DocsViewer] Empty pages.");
    }

    const readonly$ = new Val(readonly);
    const isShowPreview$ = new Val(false);
    const isSmallBox$ = new Val(false);
    const pageIndex$ = new Val<number, boolean>(0);

    withValueEnhancer(this, {
      readonly: readonly$,
      isShowPreview: isShowPreview$,
      isSmallBox: isSmallBox$,
      pageIndex: pageIndex$,
    });

    this.box = box;
    this.pages = pages;
    this.onPlay = onPlay;
  }

  protected pages: DocsViewerPage[];
  protected box: ReadonlyTeleBox;
  protected onPlay?: () => void;

  public $preview?: HTMLElement;
  public $previewMask?: HTMLElement;
  public $footer?: HTMLElement;
  // public $pageNumberInput!: HTMLInputElement;

  public mount(): void {
    this.box.$content.parentElement?.appendChild(this.renderPreviewMask());
    this.box.$content.parentElement?.appendChild(this.renderPreview());
    this.box.mountFooter(this.renderFooter());

    this.sideEffect.add(() => {
      const previewLazyLoad = new LazyLoad({
        container: this.$preview,
        elements_selector: `.${this.wrapClassName("preview-page>img")}`,
      });
      return () => previewLazyLoad.destroy();
    }, "preview-lazyload");
  }

  public unmount(): void {
    this.$preview?.remove();
    this.$previewMask?.remove();
    this.$footer?.remove();
  }

  public destroy(): void {
    this.sideEffect.flushAll();
    this.unmount();
  }

  protected renderPreview(): HTMLElement {
    if (!this.$preview) {
      const $preview = document.createElement("div");
      $preview.className = this.wrapClassName("preview") + " tele-fancy-scrollbar";
      this.$preview = $preview;

      const pageClassName = this.wrapClassName("preview-page");
      const pageNameClassName = this.wrapClassName("preview-page-name");
      this.pages.forEach((page, i) => {
        const previewSRC = page.thumbnail ?? (page.src.startsWith("ppt") ? void 0 : page.src);
        if (!previewSRC) {
          return;
        }

        const pageIndex = String(i);

        const $page = document.createElement("a");
        $page.className = pageClassName + " " + this.wrapClassName(`preview-page-${i}`);
        $page.setAttribute("href", "#");
        $page.dataset.pageIndex = pageIndex;

        const $name = document.createElement("span");
        $name.className = pageNameClassName;
        $name.textContent = String(i + 1);
        $name.dataset.pageIndex = pageIndex;

        const $img = document.createElement("img");
        $img.width = page.width;
        $img.height = page.height;
        $img.dataset.src = previewSRC;
        $img.dataset.pageIndex = pageIndex;

        $page.appendChild($img);
        $page.appendChild($name);
        $preview.appendChild($page);
      });

      this.sideEffect.addEventListener($preview, "click", ev => {
        if (this.readonly) {
          return;
        }
        const pageIndex = (ev.target as HTMLElement).dataset?.pageIndex;
        if (pageIndex) {
          ev.preventDefault();
          ev.stopPropagation();
          ev.stopImmediatePropagation();
          this.setPageIndex(Number(pageIndex), true);
          this.togglePreview(false);
        }
      });
    }

    return this.$preview;
  }

  protected renderPreviewMask(): HTMLElement {
    if (!this.$previewMask) {
      this.$previewMask = document.createElement("div");
      this.$previewMask.className = this.wrapClassName("preview-mask");
      this.sideEffect.addEventListener(this.$previewMask, "click", ev => {
        if (this.readonly) {
          return;
        }
        if (ev.target === this.$previewMask) {
          this.togglePreview(false);
        }
      });
    }
    return this.$previewMask;
  }

  protected renderFooter(): HTMLElement {
    if (!this.$footer) {
      const $footer = document.createElement("div");
      $footer.className = this.wrapClassName("footer");
      this.$footer = $footer;

      this.sideEffect.addDisposer(
        this._readonly$.subscribe(readonly => {
          $footer.classList.toggle(this.wrapClassName("readonly"), readonly);
        })
      );

      this.sideEffect.addDisposer(
        this._isSmallBox$.subscribe(isSmallBox => {
          $footer.classList.toggle(this.wrapClassName("float-footer"), isSmallBox);
        })
      );

      if (this.pages.some(page => page.thumbnail || !page.src.startsWith("ppt"))) {
        const $btnSidebar = this.renderFooterBtn("btn-sidebar", sidebarSVG(this.namespace));
        this.sideEffect.addEventListener($btnSidebar, "click", () => {
          if (this.readonly) {
            return;
          }
          this.togglePreview();
        });
        this.$footer.appendChild($btnSidebar);
      }

      const $pageJumps = document.createElement("div");
      $pageJumps.className = this.wrapClassName("page-jumps");

      const $btnPageBack = this.renderFooterBtn("btn-page-back", arrowLeftSVG(this.namespace));
      this.sideEffect.addEventListener($btnPageBack, "click", () => {
        if (this.readonly) {
          return;
        }
        this.setPageIndex(this.pageIndex - 1, true);
      });
      $pageJumps.appendChild($btnPageBack);

      if (this.onPlay) {
        const $btnPlay = this.renderFooterBtn(
          "btn-page-play",
          playSVG(this.namespace),
          pauseSVG(this.namespace)
        );
        const returnPlay = (): void => {
          this.sideEffect.setTimeout(
            () => {
              $btnPlay.classList.toggle(this.wrapClassName("footer-btn-playing"), false);
            },
            500,
            "returnPlay"
          );
        };
        this.sideEffect.addEventListener($btnPlay, "click", () => {
          if (this.readonly) {
            return;
          }
          $btnPlay.classList.toggle(this.wrapClassName("footer-btn-playing"), true);
          if (this.onPlay) {
            this.onPlay();
          }
          returnPlay();
        });

        $pageJumps.appendChild($btnPlay);
      }

      const $btnPageNext = this.renderFooterBtn("btn-page-next", arrowRightSVG(this.namespace));
      this.sideEffect.addEventListener($btnPageNext, "click", () => {
        if (this.readonly) {
          return;
        }
        this.setPageIndex(this.pageIndex + 1, true);
      });
      $pageJumps.appendChild($btnPageNext);

      const $pageNumber = document.createElement("div");
      $pageNumber.className = this.wrapClassName("page-number");

      const $pageNumberInput = document.createElement("input");
      $pageNumberInput.className = this.wrapClassName("page-number-input");
      $pageNumberInput.value = String(this.pageIndex + 1);
      this.sideEffect.addDisposer(
        this._readonly$.subscribe(readonly => {
          $pageNumberInput.disabled = readonly;
        })
      );
      this.sideEffect.addDisposer(
        this._pageIndex$.subscribe(pageIndex => {
          $pageNumberInput.value = String(pageIndex + 1);
        })
      );
      this.sideEffect.addEventListener($pageNumberInput, "focus", () => {
        $pageNumberInput.select();
      });
      this.sideEffect.addEventListener($pageNumberInput, "change", () => {
        if (this.readonly) {
          return;
        }
        if ($pageNumberInput.value) {
          this.setPageIndex(Number($pageNumberInput.value) - 1, true);
        }
      });

      const $totalPage = document.createElement("span");
      $totalPage.textContent = " / " + this.pages.length;

      $pageNumber.appendChild($pageNumberInput);
      $pageNumber.appendChild($totalPage);

      this.$footer.appendChild($pageJumps);
      this.$footer.appendChild($pageNumber);
    }
    return this.$footer;
  }

  protected renderFooterBtn(
    className: string,
    $icon: SVGElement,
    $iconActive?: SVGElement
  ): HTMLButtonElement {
    const $btn = document.createElement("button");
    $btn.className = this.wrapClassName("footer-btn") + " " + this.wrapClassName(className);

    $btn.appendChild($icon);

    if ($iconActive) {
      $btn.appendChild($iconActive);
    }

    return $btn;
  }

  protected togglePreview(isShowPreview?: boolean): void {
    this.isShowPreview = isShowPreview ?? !this.isShowPreview;
    this.box.$content.parentElement?.classList.toggle(
      this.wrapClassName("preview-active"),
      this.isShowPreview
    );
    if (this.isShowPreview && this.$preview) {
      const $previewPage = this.$preview.querySelector<HTMLElement>(
        "." + this.wrapClassName(`preview-page-${this.pageIndex}`)
      );
      if ($previewPage) {
        this.$preview.scrollTo({
          top: $previewPage.offsetTop - 16,
        });
      }
    }
  }

  protected wrapClassName(className: string): string {
    return `${this.namespace}-${className}`;
  }

  protected namespace = "netless-app-docs-viewer";

  protected sideEffect = new SideEffectManager();
}
