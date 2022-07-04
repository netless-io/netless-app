import type { AnimationMode, ReadonlyTeleBox, WhiteBoardView } from "@netless/window-manager";
import type { Camera } from "white-web-sdk";
import type { DebouncedFunction, Options } from "debounce-fn";
import debounceFn from "debounce-fn";
import { SideEffectManager } from "side-effect-manager";
import type { DocsViewerPage } from "../DocsViewer";
import { DocsViewer } from "../DocsViewer";
import { clamp, preventEvent } from "../utils/helpers";
import { Stepper } from "./stepper";
import { PageRenderer } from "../PageRenderer";
import { ScrollBar } from "../ScrollBar";

export interface StaticDocsViewerConfig {
  whiteboard: WhiteBoardView;
  readonly: boolean;
  box: ReadonlyTeleBox;
  pages: DocsViewerPage[];
  /** Scroll Top of the original page */
  pageScrollTop?: number;
  onUserScroll?: (pageScrollTop: number) => void;
}

export class StaticDocsViewer {
  public constructor({
    whiteboard,
    readonly,
    box,
    pages,
    pageScrollTop = 0,
    onUserScroll,
  }: StaticDocsViewerConfig) {
    this.whiteboard = whiteboard;
    this.readonly = readonly;
    this.box = box;
    this.pages = pages;
    this._onUserScroll = onUserScroll;

    const debouncedOnUserScroll = this.debounce(
      () => {
        this.userScrolling = false;
        if (this._onUserScroll) {
          this._onUserScroll(this.pageRenderer.pagesScrollTop);
        }
      },
      { wait: 80 },
      "debounce-updateUserScroll"
    );

    this.updateUserScroll = () => {
      this.userScrolling = true;
      debouncedOnUserScroll();
    };

    this.viewer = new DocsViewer({
      readonly,
      box,
      pages,
    });

    this.pageRenderer = new PageRenderer({
      pagesScrollTop: pageScrollTop,
      pages: this.pages,
      containerWidth: box.stageRect.width,
      containerHeight: box.stageRect.height,
      onPageIndexChanged: this.viewer.setPageIndex.bind(this.viewer),
    });

    this.scrollbar = new ScrollBar({
      pagesScrollTop: this.pageRenderer.pagesScrollTop,
      containerWidth: box.bodyRect.width,
      containerHeight: box.bodyRect.height,
      pagesWidth: this.pageRenderer.pagesIntrinsicWidth,
      pagesHeight: this.pageRenderer.pagesIntrinsicHeight,
      readonly: this.readonly,
      wrapClassName: this.wrapClassName.bind(this),
      onDragScroll: pageScrollTop => {
        this.pageScrollTo(pageScrollTop);
        this.updateUserScroll();
      },
    });

    this.pageScrollStepper = new Stepper({
      start: this.pageRenderer.pagesScrollTop,
      onStep: pageScrollTop => {
        this.pageScrollTo(pageScrollTop);
      },
    });

    this.sideEffect.addDisposer(
      this.viewer.onValChanged(
        "pageIndex",
        (pageIndex, isUserAction) => isUserAction && this.scrollToPage(pageIndex)
      )
    );

    this.render();
  }

  readonly pageRenderer: PageRenderer;
  readonly scrollbar: ScrollBar;

  protected sideEffect = new SideEffectManager();

  protected pageScrollStepper: Stepper;
  protected userScrolling = false;

  protected readonly: boolean;
  protected pages: DocsViewerPage[];
  protected box: ReadonlyTeleBox;
  protected whiteboard: WhiteBoardView;

  public _onUserScroll?: (pageScrollTop: number) => void;

  public viewer: DocsViewer;

  public mount(): this {
    this.viewer.mount();

    this.setupScrollListener();

    // guard scroll position
    this.sideEffect.setTimeout(() => {
      if (!this.userScrolling) {
        this.pageScrollTo(this.pageRenderer.pagesScrollTop);
      }
    }, 100);

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
      this.scrollbar.setReadonly(readonly);
    }
  }

  public destroy(): void {
    this.sideEffect.flushAll();
    this.pageScrollStepper.destroy();
    this._onUserScroll = void 0;
    this.unmount();
    this.viewer.destroy();
    this.pageRenderer.destroy();
    this.scrollbar.destroy();
  }

  /** Sync scrollTop from writable user */
  public syncPageScrollTop(pageScrollTop: number): void {
    if (
      !this.userScrolling &&
      pageScrollTop >= 0 &&
      Math.abs(this.pageRenderer.pagesScrollTop - pageScrollTop) > 0.01
    ) {
      this.pageScrollStepper.stepTo(pageScrollTop, this.pageRenderer.pagesScrollTop);
    }
  }

  public render(): void {
    this.box.$content.style.overflow = "hidden";
    this.box.mountStage(this.pageRenderer.$pages);
    this.scrollbar.mount(this.box.$body);
  }

  protected scrollTopPageToEl(pageScrollTop: number): number {
    return pageScrollTop * this.pageRenderer.scale;
  }

  protected scrollTopElToPage(elScrollTop: number): number {
    return elScrollTop / this.pageRenderer.scale;
  }

  /** Scroll base on DOM rect */
  protected elScrollTo(elScrollTop: number): void {
    this.pageScrollTo(this.scrollTopElToPage(elScrollTop));
  }

  /** Scroll base on docs size */
  protected pageScrollTo(pageScrollTop: number): void {
    const halfWbHeight = this.scrollTopElToPage(this.whiteboard.view.size.height / 2);
    this.whiteboard.view.moveCamera({
      centerY: clamp(
        pageScrollTop + halfWbHeight,
        halfWbHeight,
        this.pageRenderer.pagesIntrinsicHeight - halfWbHeight
      ),
      animationMode: "immediately" as AnimationMode,
    });
  }

  protected scrollToPage(index: number): void {
    if (!this.readonly && !Number.isNaN(index)) {
      const offsetY = this.pageRenderer.pagesIntrinsicYs[index];
      if (offsetY >= 0) {
        this.pageScrollTo(offsetY + 5 / this.pageRenderer.scale);
        this.updateUserScroll();
      }
    }
  }

  protected setupScrollListener(): void {
    this.sideEffect.addEventListener(
      this.box.$main,
      "wheel",
      ev => {
        preventEvent(ev);
        if (!this.readonly) {
          this.pageScrollTo(this.pageRenderer.pagesScrollTop + ev.deltaY);
          this.updateUserScroll();
        }
      },
      { passive: false, capture: true }
    );

    this.sideEffect.addEventListener(
      this.box.$main,
      "touchmove",
      ev => {
        if (this.readonly || ev.touches.length <= 1) {
          return;
        }
        this.updateUserScroll();
      },
      { passive: true, capture: true }
    );

    this.sideEffect.add(() => {
      const handleCameraUpdate = (camera: Camera) => {
        const { width: wbWidth, height: wbHeight } = this.whiteboard.view.size;
        if (wbWidth <= 0 || wbHeight <= 0) {
          return;
        }

        const pagesScrollTop =
          camera.centerY - this.pageRenderer.containerHeight / this.pageRenderer.scale / 2;

        this.pageRenderer.pagesScrollTo(pagesScrollTop);
        this.scrollbar.pagesScrollTo(pagesScrollTop);
      };
      this.whiteboard.view.callbacks.on("onCameraUpdated", handleCameraUpdate);
      return () => this.whiteboard.view.callbacks.off("onCameraUpdated", handleCameraUpdate);
    });

    this.sideEffect.addDisposer(
      this.box._stageRect$.subscribe(stageRect => {
        this.pageRenderer.setContainerSize(this.box.stageRect.width, this.box.stageRect.height);
        this.scrollbar.setContainerSize(this.box.bodyRect.width, this.box.bodyRect.height);

        const { pagesIntrinsicWidth, pagesIntrinsicHeight } = this.pageRenderer;

        this.whiteboard.view.moveCameraToContain({
          originX: 0,
          originY: this.pageRenderer.pagesScrollTop,
          width: pagesIntrinsicWidth,
          height: stageRect.height / this.pageRenderer.scale,
          animationMode: "immediately" as AnimationMode,
        });

        this.whiteboard.view.setCameraBound({
          damping: 1,
          maxContentMode: () => this.pageRenderer.scale,
          minContentMode: () => this.pageRenderer.scale,
          centerX: pagesIntrinsicWidth / 2,
          centerY: pagesIntrinsicHeight / 2,
          width: pagesIntrinsicWidth,
          height: pagesIntrinsicHeight,
        });
      }),
      "whiteboard-size-update"
    );

    this.sideEffect.addEventListener(
      window,
      "keyup",
      ev => {
        if (this.readonly || !this.box.focus || this.box.minimized) {
          return;
        }
        let newPageScrollTop: number | null = null;
        switch (ev.key) {
          case "PageDown": {
            newPageScrollTop =
              this.pageRenderer.pagesScrollTop +
              this.pageRenderer.containerHeight / this.pageRenderer.scale;
            break;
          }
          case "PageUp": {
            newPageScrollTop =
              this.pageRenderer.pagesScrollTop -
              this.pageRenderer.containerHeight / this.pageRenderer.scale;
            break;
          }
          case "ArrowDown": {
            newPageScrollTop =
              this.pageRenderer.pagesScrollTop +
              this.pageRenderer.containerHeight / 4 / this.pageRenderer.scale;
            break;
          }
          case "ArrowUp": {
            newPageScrollTop =
              this.pageRenderer.pagesScrollTop -
              this.pageRenderer.containerHeight / 4 / this.pageRenderer.scale;
            break;
          }
          default:
            break;
        }
        if (newPageScrollTop !== null) {
          if (this._onUserScroll) {
            // this will trigger stepper for smooth scrolling effect
            this._onUserScroll(newPageScrollTop);
          } else {
            this.pageScrollTo(newPageScrollTop);
            this.updateUserScroll();
          }
        }
      },
      { capture: true }
    );
  }

  protected debounce<ArgumentsType extends unknown[], ReturnType>(
    fn: (...args: ArgumentsType) => ReturnType,
    options?: Options,
    disposerID?: string
  ): DebouncedFunction<ArgumentsType, ReturnType | undefined> {
    const dFn = debounceFn(fn, options);
    this.sideEffect.addDisposer(() => dFn.cancel(), disposerID);
    return dFn;
  }

  protected updateUserScroll: () => void;

  protected wrapClassName(className: string): string {
    return "netless-app-docs-viewer-static-" + className;
  }

  protected onNewPageIndex = (index: number): void => {
    this.scrollToPage(index);
  };
}
