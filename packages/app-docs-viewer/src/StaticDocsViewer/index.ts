/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AnimationMode, AppContext, ReadonlyTeleBox } from "@netless/window-manager";
import type { View, Size, Camera } from "white-web-sdk";
import type { DebouncedFunction, Options } from "debounce-fn";
import debounceFn from "debounce-fn";
import { SideEffectManager } from "side-effect-manager";
import { ResizeObserver as Polyfill } from "@juggle/resize-observer";
import type { DocsViewerPage } from "../DocsViewer";
import { DocsViewer } from "../DocsViewer";
import { clamp, isEditable, preventEvent } from "../utils/helpers";
import { Stepper } from "./stepper";
import { PageRenderer } from "../PageRenderer";
import { ScrollBar } from "../ScrollBar";
import type { NetlessAppStaticDocsViewerAttributes } from "..";

const ResizeObserver = window.ResizeObserver || Polyfill;

const RATIO_BASE_CONTAINER_HEIGHT = 640;

export interface StaticDocsViewerConfig {
  context: AppContext<NetlessAppStaticDocsViewerAttributes>;
  whiteboardView: View;
  readonly: boolean;
  box: ReadonlyTeleBox;
  pages: DocsViewerPage[];
  mountWhiteboard: (dom: HTMLDivElement) => void;
  /** Scroll Top of the original page */
  pageScrollTop?: number;
  onUserScroll?: (pageScrollTop: number) => void;
  baseScenePath: string | undefined;
  appId: string;
}

export interface SavePdfConfig {
  appId: string;
  type: "@netless/_request_save_pdf_";
}

export class StaticDocsViewer {
  public constructor({
    context,
    whiteboardView,
    readonly,
    box,
    pages,
    pageScrollTop = 0,
    mountWhiteboard,
    onUserScroll,
    baseScenePath,
    appId,
  }: StaticDocsViewerConfig) {
    this.context = context;
    this.whiteboardView = whiteboardView;
    this.readonly = readonly;
    this.box = box;
    this.pages = pages;
    this.baseScenePath = baseScenePath;
    this.appId = appId;
    this.mountWhiteboard = mountWhiteboard;
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
      onNewPageIndex: this.onNewPageIndex,
    });

    const { width: containerWidth, height: containerHeight } = this.whiteboardView.size;

    this.pageRenderer = new PageRenderer({
      pagesScrollTop: pageScrollTop,
      pages: this.pages,
      containerWidth,
      containerHeight,
      onPageIndexChanged: this.viewer.setPageIndex.bind(this.viewer),
    });

    this.scrollbar = new ScrollBar({
      pagesScrollTop: this.pageRenderer.pagesScrollTop,
      containerWidth,
      containerHeight,
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

    this.render();
  }

  readonly pageRenderer: PageRenderer;
  readonly scrollbar: ScrollBar;
  readonly context: AppContext<NetlessAppStaticDocsViewerAttributes>;

  protected sideEffect = new SideEffectManager();

  protected pageScrollStepper: Stepper;
  protected userScrolling = false;

  protected readonly: boolean;
  protected pages: DocsViewerPage[];
  protected box: ReadonlyTeleBox;
  protected whiteboardView: View;
  private readonly baseScenePath: string | undefined;
  private readonly appId: string;
  protected mountWhiteboard: (dom: HTMLDivElement) => void;

  public _onUserScroll?: (pageScrollTop: number) => void;

  public viewer: DocsViewer;

  public $whiteboardView!: HTMLDivElement;

  public mount(): this {
    this.viewer.mount();

    this.setupScrollListener();

    const debouncedRenderRatioHeight = this.debounce(this.renderRatioHeight.bind(this), {
      wait: 80,
    });

    this.sideEffect.add(() => {
      const observer = new ResizeObserver(debouncedRenderRatioHeight);
      observer.observe(this.viewer.$content);
      return () => observer.disconnect();
    });

    // guard scroll position
    this.sideEffect.setTimeout(() => {
      if (!this.userScrolling) {
        this.pageScrollTo(this.pageRenderer.pagesScrollTop);
      }
    }, 100);

    this.sideEffect.add(() => {
      const handleDownloadPdf = (evt: MessageEvent<SavePdfConfig>) => {
        if (evt.data.type === "@netless/_request_save_pdf_" && evt.data.appId === this.appId) {
          this.toPdf().catch(() => this.reportProgress(100, null));
        }
      };
      window.addEventListener("message", handleDownloadPdf);
      return () => {
        window.removeEventListener("message", handleDownloadPdf);
      };
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
    this.pageRenderer.mount(this.viewer.$content);
    this.viewer.$content.appendChild(this.renderWhiteboardView());
    this.scrollbar.mount(this.viewer.$content);
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
            this.pageScrollTo(this.pageRenderer.pagesScrollTop + ev.deltaY);
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
    const halfWbHeight = this.scrollTopElToPage(this.whiteboardView.size.height / 2);
    this.whiteboardView.moveCamera({
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
    this.sideEffect.add(() => {
      const handleCameraUpdate = (camera: Camera) => {
        const { width: wbWidth, height: wbHeight } = this.whiteboardView.size;
        if (wbWidth <= 0 || wbHeight <= 0) {
          return;
        }

        const pagesScrollTop =
          camera.centerY - this.pageRenderer.containerHeight / this.pageRenderer.scale / 2;

        this.pageRenderer.pagesScrollTo(pagesScrollTop);
        this.scrollbar.pagesScrollTo(pagesScrollTop);
      };
      this.whiteboardView.callbacks.on("onCameraUpdated", handleCameraUpdate);
      return () => this.whiteboardView.callbacks.off("onCameraUpdated", handleCameraUpdate);
    });

    // Handle drag event (hand tool).
    this.sideEffect.add(() => {
      const { updateUserScroll } = this;
      this.whiteboardView.callbacks.on("onCameraUpdatedByDevice", updateUserScroll);
      return () => this.whiteboardView.callbacks.off("onCameraUpdatedByDevice", updateUserScroll);
    });

    this.sideEffect.add(() => {
      const handleSizeUpdate = ({ width: wbWidth, height: wbHeight }: Size): void => {
        if (wbWidth <= 0 || wbHeight <= 0) {
          return;
        }

        this.pageRenderer.setContainerSize(wbWidth, wbHeight);
        this.scrollbar.setContainerSize(wbWidth, wbHeight);

        const { pagesIntrinsicWidth, pagesIntrinsicHeight } = this.pageRenderer;

        this.whiteboardView.moveCameraToContain({
          originX: 0,
          originY: this.pageRenderer.pagesScrollTop,
          width: pagesIntrinsicWidth,
          height: wbHeight / this.pageRenderer.scale,
          animationMode: "immediately" as AnimationMode,
        });

        this.whiteboardView.setCameraBound({
          damping: 1,
          maxContentMode: () => this.pageRenderer.scale,
          minContentMode: () => this.pageRenderer.scale,
          centerX: pagesIntrinsicWidth / 2,
          centerY: pagesIntrinsicHeight / 2,
          width: pagesIntrinsicWidth,
          height: pagesIntrinsicHeight,
        });
      };
      this.whiteboardView.callbacks.on("onSizeUpdated", handleSizeUpdate);
      return () => {
        this.whiteboardView.callbacks.off("onSizeUpdated", handleSizeUpdate);
      };
    }, "whiteboard-size-update");

    this.sideEffect.addEventListener(
      window,
      "keyup",
      ev => {
        if (this.readonly || !this.box.focus || this.box.minimized || isEditable(ev.target)) {
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

  private async getBase64FromUrl(url: string): Promise<string> {
    const data = await fetch(this._invalidate(url));
    const blob = await data.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = reader.result as string;
        resolve(base64data);
      };
    });
  }

  private _invalidate(url: string): string {
    try {
      const a = new URL(url);
      a.searchParams.set("t", Date.now().toString());
      return a.toString();
    } catch {
      return url;
    }
  }

  private reportProgress(progress: number, result: { pdf: ArrayBuffer; title: string } | null) {
    window.postMessage({
      type: "@netless/_result_save_pdf_",
      appId: this.appId,
      progress,
      result,
    });
  }

  public toPdf = async () => {
    const whiteSnapshotCanvas = document.createElement("canvas");
    const whiteCtx = whiteSnapshotCanvas.getContext("2d");
    if (!whiteCtx || !this.baseScenePath) {
      this.reportProgress(100, null);
      return;
    }
    const scenePath = this.whiteboardView.focusScenePath || `${this.baseScenePath}/1`;
    const firstPage = this.pages[0];
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      format: [firstPage.width, firstPage.height],
      orientation: firstPage.width > firstPage.height ? "l" : "p",
      compress: true,
    });

    for (const [index, page] of this.pages.entries()) {
      const { width, height, src } = page;
      whiteSnapshotCanvas.width = width;
      whiteSnapshotCanvas.height = height;
      const orientation = width > height ? "l" : "p";

      if (index > 0) {
        pdf.addPage([width, height], orientation);
      }

      const pdfPageSrc = await this.getBase64FromUrl(src);
      const img = document.createElement("img");
      img.src = pdfPageSrc;
      await new Promise(resolve => (img.onload = resolve));
      whiteCtx.drawImage(img, 0, 0);
      const pdfPageBase64 = whiteSnapshotCanvas.toDataURL("image/jpeg", 0.6);
      whiteCtx.clearRect(0, 0, width, height);
      const camera = {
        centerX: width / 2,
        centerY: height / 2 + index * height,
        scale: 1,
      };
      // appliancePlugin is a performance optimization for whiteboard;
      const windowManger = (this.context as any).manager.windowManger as any;
      if (windowManger._appliancePlugin) {
        await windowManger._appliancePlugin.screenshotToCanvasAsync(
          whiteCtx,
          scenePath,
          width,
          height,
          camera
        );
      } else {
        this.whiteboardView.screenshotToCanvas(whiteCtx, scenePath, width, height, camera);
      }
      const snapshot = whiteSnapshotCanvas.toDataURL("image/png");
      pdf.addImage(pdfPageBase64, "JPEG", 0, 0, width, height, "", "FAST");
      pdf.addImage(snapshot, "PNG", 0, 0, width, height, "", "FAST");

      whiteCtx.clearRect(0, 0, width, height);
      const progress = Math.ceil(((index + 1) / this.pages.length) * 100);
      if (progress < 100) {
        this.reportProgress(Math.ceil(((index + 1) / this.pages.length) * 100), null);
      }
    }
    const dataUrl = pdf.output("arraybuffer");
    this.reportProgress(100, { pdf: dataUrl, title: this.box.title });
  };
}
