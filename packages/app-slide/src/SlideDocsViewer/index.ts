/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReadonlyTeleBox, AnimationMode, View, AppContext } from "@netless/window-manager";
import type { SlideController, SlideControllerOptions } from "../SlideController";

import { SideEffectManager } from "side-effect-manager";
import { createDocsViewerPages } from "../SlideController";
import { DocsViewer, type DocsViewerPage } from "../DocsViewer";
import { logger } from "../utils/logger";
import { isEditable } from "../utils/helpers";
import type { Attributes, MagixEvents } from "../typings";
import type { AppOptions } from "..";

export const ClickThroughAppliances = new Set(["clicker"]);

const noop = function noop() {
  // do nothing
};

export type MountSlideOptions = Omit<SlideControllerOptions, "context" | "onPageChanged"> & {
  onReady: () => void;
};

export interface SlideDocsViewerConfig {
  context: AppContext<Attributes, MagixEvents, AppOptions>;
  box: ReadonlyTeleBox;
  view: View;
  mountSlideController: (options: MountSlideOptions) => SlideController;
  mountWhiteboard: (dom: HTMLDivElement) => void;
  baseScenePath: string;
  appId: string;
  urlInterrupter?: (url: string) => Promise<string>;
  onPagesReady?: (pages: DocsViewerPage[]) => void;
  onNavigate?: (index: number, origin?: string) => void;
}

export interface SavePdfConfig {
  appId: string;
  type: "@netless/_request_save_pdf_";
}

export class SlideDocsViewer {
  readonly context: AppContext<Attributes, MagixEvents, AppOptions>;
  public viewer: DocsViewer;
  public slideController: SlideController | null = null;

  protected readonly box: ReadonlyTeleBox;
  protected readonly whiteboardView: SlideDocsViewerConfig["view"];
  protected readonly mountSlideController: SlideDocsViewerConfig["mountSlideController"];
  protected readonly mountWhiteboard: SlideDocsViewerConfig["mountWhiteboard"];
  protected readonly onNavigate: (index: number, origin?: string) => void;
  private readonly baseScenePath: string;
  private readonly appId: string;
  private isViewMounted = false;
  private justSildeReadonly = false;

  public constructor({
    context,
    box,
    view,
    mountSlideController,
    mountWhiteboard,
    baseScenePath,
    appId,
    urlInterrupter,
    onPagesReady,
    onNavigate,
  }: SlideDocsViewerConfig) {
    this.context = context;
    this.box = box;
    this.whiteboardView = view;
    this.mountSlideController = mountSlideController;
    this.mountWhiteboard = mountWhiteboard;
    this.onNavigate = onNavigate || noop;
    this.baseScenePath = baseScenePath;
    this.appId = appId;
    this.viewer = new DocsViewer({
      readonly: box.readonly,
      onNewPageIndex: this.onNewPageIndex,
      onPlay: this.onPlay,
      urlInterrupter,
      onPagesReady,
    });

    this.sideEffect.add(() => {
      const handler = (readonly: boolean): void => {
        this.setReadonly(readonly);
      };
      box.events.on("readonly", handler);
      return () => box.events.off("readonly", handler);
    });
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

    this.render();
  }

  public $slide!: HTMLDivElement;
  public $whiteboardView!: HTMLDivElement;
  public $overlay!: HTMLDivElement;

  public setJustSildeReadonly(justSildeReadonly: boolean) {
    this.justSildeReadonly = justSildeReadonly;
    this.slideController?.slide.setInteractive(!this.justSildeReadonly);
  }

  public render() {
    this.viewer.$content.appendChild(this.renderSlideContainer());
    this.viewer.$content.appendChild(this.renderWhiteboardView());
    this.viewer.$content.appendChild(this.renderOverlay());
    this.sideEffect.addEventListener(window, "keydown", ev => {
      if (this.justSildeReadonly) {
        return;
      }
      if (this.box.focus && this.slideController && !isEditable(ev.target)) {
        switch (ev.key) {
          case "ArrowUp":
          case "ArrowLeft": {
            this.slideController.slide.prevStep();
            this.onNavigate(this.slideController.page, "keydown");
            break;
          }
          case "ArrowRight":
          case "ArrowDown": {
            this.slideController.slide.nextStep();
            this.onNavigate(this.slideController.page, "keydown");
            break;
          }
          default: {
            break;
          }
        }
      }
    });
  }

  protected renderOverlay(): HTMLDivElement {
    if (!this.$overlay) {
      const $overlay = document.createElement("div");
      $overlay.className = this.wrapClassName("overlay");
      this.$overlay = $overlay;
    }
    return this.$overlay;
  }

  protected renderSlideContainer(): HTMLDivElement {
    if (!this.$slide) {
      const $slide = document.createElement("div");
      $slide.className = this.wrapClassName("slide");
      $slide.dataset.appKind = "Slide";
      this.$slide = $slide;
    }
    return this.$slide;
  }

  protected renderWhiteboardView(): HTMLDivElement {
    if (!this.$whiteboardView) {
      this.$whiteboardView = document.createElement("div");
      this.$whiteboardView.className = this.wrapClassName("wb-view");
    }
    return this.$whiteboardView;
  }

  public mount() {
    this.box.mountContent(this.viewer.$content);
    this.box.mountFooter(this.viewer.$footer);

    this.slideController = this.mountSlideController({
      anchor: this.$slide,
      onRenderStart: this.onRenderStart,
      onRenderEnd: this.onRenderEnd,
      onTransitionStart: this.viewer.setPlaying,
      onTransitionEnd: this.viewer.setPaused,
      onReady: this.refreshPages,
      onNavigate: this.onNavigate,
      onError: this.onError,
    });

    this.scaleDocsToFit();
    this.sideEffect.add(() => {
      this.whiteboardView.callbacks.on("onSizeUpdated", this.scaleDocsToFit);
      return () => this.whiteboardView.callbacks.off("onSizeUpdated", this.scaleDocsToFit);
    });

    return this;
  }

  protected onError = ({ error, index }: { error: Error; index: number }) => {
    this.viewer.setPaused();
    if (this.slideController?.showRenderError) {
      this.$overlay.textContent = `Error on slide[page=${this.slideController.page}]: ${error.message}`;
      this.$overlay.style.opacity = "1";
    }
    if (this.slideController?.onRenderError) {
      this.slideController.onRenderError(error, index);
    }
    logger.warn("[Slide] render error", error);
  };

  protected onRenderStart = () => {
    this.$whiteboardView.classList.add(this.wrapClassName("wb-view-hidden"));
    this.viewer.setPlaying();
  };

  protected onRenderEnd = () => {
    // 1. There's no render end event on initial render.
    // 2. The end event is fired before the page changed event.
    // So in this callback we will do nothing and we do all "end" works in onPageChanged.
  };

  public onPageChanged = () => {
    clearTimeout(this._onPageChangedTimer);
    this._onPageChangedTimer = setTimeout(this._onPageChanged, 200) as unknown as number;
  };

  private _onPageChangedTimer = 0;
  private _onPageChanged = () => {
    this.$overlay.style.opacity = "";
    this.$whiteboardView.classList.remove(this.wrapClassName("wb-view-hidden"));
  };

  protected refreshPages = () => {
    if (this.slideController) {
      this.viewer.pages = createDocsViewerPages(
        this.slideController.slide,
        this.slideController.previewList
      );
      this.viewer.setPageIndex(this.getPageIndex(this.slideController.page));
      this.scaleDocsToFit();
    }
  };

  protected getPageIndex(page: number) {
    return (page > 0 ? page : 1) - 1;
  }

  public unmount() {
    if (this.slideController) {
      this.slideController.destroy();
      this.slideController = null;
    }
    this.viewer.unmount();
    return this;
  }

  public setReadonly(readonly: boolean) {
    this.viewer.setReadonly(readonly);
  }

  public destroy() {
    this.sideEffect.flushAll();
    this.unmount();
    this.viewer.destroy();
  }

  public toggleClickThrough(tool?: string) {
    this.$whiteboardView.style.pointerEvents =
      !tool || ClickThroughAppliances.has(tool) ? "none" : "auto";
  }

  protected scaleDocsToFit = () => {
    if (this.slideController) {
      const { width, height } = this.slideController.slide;
      if (width && height) {
        this.whiteboardView.moveCameraToContain({
          originX: -width / 2,
          originY: -height / 2,
          width,
          height,
          animationMode: "immediately" as AnimationMode.Immediately,
        });
        this.whiteboardView.setCameraBound({
          damping: 1,
          maxContentMode: () => this.whiteboardView.camera.scale,
          minContentMode: () => this.whiteboardView.camera.scale,
          centerX: 0,
          centerY: 0,
          width,
          height,
        });
        if (!this.isViewMounted) {
          this.isViewMounted = true;
          console.log("[Slide] mount whiteboard view");
          this.mountWhiteboard(this.$whiteboardView);
        }
      }
    }
  };

  protected onPlay = () => {
    if (this.slideController) {
      this.slideController.slide.nextStep();
    }
  };

  protected onNewPageIndex = (index: number, origin?: string) => {
    if (this.slideController) {
      this.slideController.jumpToPage(index + 1, origin);
    }
  };

  protected sideEffect = new SideEffectManager();

  protected wrapClassName(className: string) {
    return `${this.namespace}-${className}`;
  }

  protected namespace = "netless-app-slide";

  private async getWhiteSnapshot(
    pageIndex: number,
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    slideWidth: number,
    slideHeight: number
  ) {
    const camera = {
      centerX: 0,
      centerY: 0,
      scale: Math.min(canvas.width / slideWidth, canvas.height / slideHeight),
    };
    const scenePath = `${this.baseScenePath}/${pageIndex}`;
    // appliancePlugin is a performance optimization for whiteboard;
    const windowManger = (this.context as any).manager.windowManger as any;
    if (windowManger._appliancePlugin) {
      await windowManger._appliancePlugin.screenshotToCanvasAsync(
        ctx,
        scenePath,
        canvas.width,
        canvas.height,
        camera
      );
    } else {
      // Render whiteboard into canvas, and it must fit the slide size.
      this.whiteboardView.screenshotToCanvas(ctx, scenePath, canvas.width, canvas.height, camera);
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

  private toPdf = async () => {
    if (!this.slideController) {
      this.reportProgress(100, null);
      return;
    }
    const { slide } = this.slideController;
    const MAX = 1920;
    const resizeCanvas = document.createElement("canvas");
    const resizeCtx = resizeCanvas.getContext("2d");
    const { slideCount, width, height } = slide;
    let pdfWidth = Math.floor(width);
    let pdfHeight = Math.floor(height);
    if (pdfWidth > MAX) {
      pdfWidth = MAX;
      pdfHeight = Math.floor((height * pdfWidth) / width);
    }
    if (pdfHeight > MAX) {
      pdfHeight = MAX;
      pdfWidth = Math.floor((width * pdfHeight) / height);
    }
    resizeCanvas.width = pdfWidth;
    resizeCanvas.height = pdfHeight;

    const whiteSnapshotCanvas = document.createElement("canvas");
    whiteSnapshotCanvas.width = pdfWidth;
    whiteSnapshotCanvas.height = pdfHeight;
    const whiteCtx = whiteSnapshotCanvas.getContext("2d");
    if (!whiteCtx || !this.getWhiteSnapshot || !resizeCtx) {
      this.reportProgress(100, null);
      return null;
    }

    const orientation = pdfWidth > pdfHeight ? "l" : "p";
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      format: [pdfWidth, pdfHeight],
      orientation,
      compress: true,
    });

    for (let i = 1; i <= slideCount; i++) {
      let slideSnapshot = null;
      try {
        slideSnapshot = await this.slideController.slide.snapshotWithTimingEnd(i);
      } catch {
        // ignore
      }

      if (slideSnapshot) {
        const img = document.createElement("img");
        img.src = slideSnapshot;
        await new Promise(resolve => (img.onload = resolve));
        resizeCtx.drawImage(img, 0, 0, pdfWidth, pdfHeight);
      }
      whiteCtx.clearRect(0, 0, pdfWidth, pdfHeight);
      await this.getWhiteSnapshot(i, whiteSnapshotCanvas, whiteCtx, width, height);
      try {
        const whiteSnapshot = whiteSnapshotCanvas.toDataURL("image/png");
        const whiteImg = document.createElement("img");
        whiteImg.src = whiteSnapshot;
        await new Promise(resolve => (whiteImg.onload = resolve));
        resizeCtx.drawImage(whiteImg, 0, 0, pdfWidth, pdfHeight);
      } catch (e) {
        // ignore
      }

      const outputDataUrl = resizeCanvas.toDataURL("image/jpeg", 0.6);
      if (i > 1) {
        pdf.addPage();
      }
      pdf.addImage(outputDataUrl, "JPEG", 0, 0, pdfWidth, pdfHeight, "", "FAST");
      resizeCtx.clearRect(0, 0, pdfWidth, pdfHeight);
      const progress = Math.ceil((i / slideCount) * 100);
      if (progress < 100) {
        this.reportProgress(Math.ceil((i / slideCount) * 100), null);
      }
    }
    const dataUrl = pdf.output("arraybuffer");
    const title = this.box.title;
    this.reportProgress(100, { pdf: dataUrl, title });
  };
}
