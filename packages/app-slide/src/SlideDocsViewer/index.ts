/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ReadonlyTeleBox,
  AnimationMode,
  View,
  AppContext,
  StorageStateChangedListener,
} from "@netless/window-manager";
import type { SlideController, SlideControllerOptions } from "../SlideController";

import { SideEffectManager } from "side-effect-manager";
import { createDocsViewerPages } from "../SlideController";
import { DocsViewer, type DocsViewerPage } from "../DocsViewer";
import { ResizableContainer } from "../DocsViewer/ResizableContainer";
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
  enableScale?: boolean;
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
  protected readonly baseScenePath: string;
  protected readonly appId: string;
  protected isViewMounted = false;
  protected justSildeReadonly = false;
  private enableScale: boolean;

  public constructor({
    context,
    box,
    view,
    mountSlideController,
    mountWhiteboard,
    baseScenePath,
    appId,
    urlInterrupter,
    enableScale,
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
    this.enableScale = enableScale ?? false;
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

    // 在 render() 之后设置监听器，确保 ResizableContainer 已经创建
    this.sideEffect.add(() => {
      const applyScale = (scale: number) => {
        if (this.resizableContainer) {
          this.resizableContainer.scaleContainer(scale);
        }
      };

      // 记录初始状态
      console.log("[SlideDocsViewer] Initial storage state:", this.context.storage.state);
      console.log("[SlideDocsViewer] Initial slideScale:", this.context.storage.state.slideScale);

      // 应用初始的 slideScale 值（现在 ResizableContainer 应该已经创建）
      if (this.context.storage.state.slideScale !== undefined) {
        console.log(
          "[SlideDocsViewer] Applying initial slideScale:",
          this.context.storage.state.slideScale
        );
        applyScale(this.context.storage.state.slideScale);
      } else {
        console.log("[SlideDocsViewer] No initial slideScale found");
      }

      const handler: StorageStateChangedListener<Attributes> = diff => {
        if (diff.slideScale !== undefined) {
          // slideScale 是一个包含 newValue 和 oldValue 的对象
          const newScale = diff.slideScale.newValue;
          applyScale(newScale ?? 1);
        }
        if (diff.translateX !== undefined || diff.translateY !== undefined) {
          const currentTranslate = this.resizableContainer.getTranslate();
          const translateX = diff.translateX ? diff.translateX.newValue ?? 0.5 : currentTranslate.x;
          const translateY = diff.translateY ? diff.translateY.newValue ?? 0.5 : currentTranslate.y;
          if (this.resizableContainer) {
            this.resizableContainer.handleNormalizeTranslate(translateX, translateY, {
              triggerScrollBar: true,
              triggerSync: false,
            });
          }
        }
      };

      console.log("[SlideDocsViewer] Adding storage state listener");
      this.context.storage.onStateChanged.addListener(handler);

      return () => {
        console.log("[SlideDocsViewer] Removing storage state listener");
        this.context.storage.onStateChanged.removeListener(handler);
      };
    });
  }

  public $slide!: HTMLDivElement;
  public $whiteboardView!: HTMLDivElement;
  public $overlay!: HTMLDivElement;
  public resizableContainer!: ResizableContainer;

  public setJustSildeReadonly(justSildeReadonly: boolean) {
    this.justSildeReadonly = justSildeReadonly;
    this.slideController?.slide.setInteractive(!this.justSildeReadonly);
  }

  public render() {
    // 创建 ResizableContainer 来管理 slide 和 whiteboardView
    if (!this.resizableContainer) {
      this.resizableContainer = new ResizableContainer(
        this.viewer.$content,
        this.context,
        this.enableScale
      );
    }

    // 创建元素
    this.renderSlideContainer();
    this.renderWhiteboardView();
    this.renderOverlay();

    // 分别添加 slide 和 whiteboardView 到 ResizableContainer
    this.resizableContainer.addSlideContainer(this.$slide);
    this.resizableContainer.addWhiteboardContainer(this.$whiteboardView);
    this.viewer.$content.appendChild(this.$overlay);
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

    this.resizableContainer.setSlideObject(this.slideController.slide);
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

  protected _onPageChangedTimer = 0;
  protected _onPageChanged = () => {
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
    this.resizableContainer.destroy();
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

  protected async getWhiteSnapshot(
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

  protected reportProgress(progress: number, result: { pdf: ArrayBuffer; title: string } | null) {
    window.postMessage({
      type: "@netless/_result_save_pdf_",
      appId: this.appId,
      progress,
      result,
    });
  }

  protected toPdf = async () => {
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
