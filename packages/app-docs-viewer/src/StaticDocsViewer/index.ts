import type { AnimationMode, ReadonlyTeleBox, WhiteBoardView } from "@netless/window-manager";
import type { Camera } from "white-web-sdk";
import { SideEffectManager } from "side-effect-manager";
import type { DocsViewerPage } from "../DocsViewer";
import { DocsViewer } from "../DocsViewer";
import { clamp, preventEvent, sameSize } from "../utils/helpers";
import { Stepper } from "./stepper";
import { PageRenderer } from "../PageRenderer";
import { ScrollBar } from "../ScrollBar";
import { derive, Val, type ReadonlyVal } from "value-enhancer";

export interface StaticDocsViewerConfig {
  whiteboard: WhiteBoardView;
  readonly$: ReadonlyVal<boolean>;
  box: ReadonlyTeleBox;
  pages: DocsViewerPage[];
  /** Scroll Top of the original page */
  pagesScrollTop?: number;
  onUserScroll?: (pageScrollTop: number) => void;
}

export class StaticDocsViewer {
  readonly readonly$: StaticDocsViewerConfig["readonly$"];

  readonly pagesScrollTop$: Val<number>;
  get pagesScrollTop(): number {
    return this.pagesScrollTop$.value;
  }

  readonly pagesSize$: ReadonlyVal<{ width: number; height: number }>;

  public constructor({
    whiteboard,
    readonly$,
    box,
    pages,
    pagesScrollTop = 0,
    onUserScroll,
  }: StaticDocsViewerConfig) {
    this.whiteboard = whiteboard;
    this.readonly$ = readonly$;
    this.box = box;
    this.pages = pages;
    this.onUserScroll = onUserScroll;

    const handleDebounceOnUserScroll = () => {
      this.userScrolling = false;
      this.onUserScroll?.(this.pagesScrollTop$.value);
    };
    this.debounceOnUserScroll = () => {
      this.userScrolling = true;
      this.sideEffect.setTimeout(handleDebounceOnUserScroll, 80, "debounceOnUserScroll");
    };

    const pages$ = new Val(pages);
    this.pagesScrollTop$ = new Val(pagesScrollTop);
    this.pagesSize$ = derive(
      pages$,
      pages => {
        let width = 0;
        let height = 0;
        for (let i = pages.length - 1; i >= 0; i--) {
          const page = pages[i];
          if (page.width > width) {
            width = page.width;
          }
          height += page.height;
        }
        return { width: Math.max(1, width), height: Math.max(1, height) };
      },
      { compare: sameSize }
    );

    this.pageRenderer = new PageRenderer({
      pagesScrollTop$: this.pagesScrollTop$,
      containerRect$: box._stageRect$,
      pages$,
      pagesSize$: this.pagesSize$,
    });

    this.viewer = new DocsViewer({
      readonly$,
      pagesIndex$: this.pageRenderer._pagesIndex$,
      previewRoot: box.$body,
      footerRoot: box.$footer,
      pages$,
      playable: false,
    });

    this.sideEffect.addDisposer([
      this.viewer.events.on("next", () => {
        this.userScrollByPercent(0.8);
      }),
      this.viewer.events.on("back", () => {
        this.userScrollByPercent(-0.8);
      }),
    ]);

    this.scrollbar = new ScrollBar({
      pagesScrollTop$: this.pagesScrollTop$,
      containerRect$: box._bodyRect$,
      stageRect$: box._stageRect$,
      pagesSize$: this.pagesSize$,
      readonly$,
      wrapClassName: this.wrapClassName.bind(this),
      onDragScroll: pageScrollTop => {
        this.pageScrollTo(pageScrollTop);
        this.debounceOnUserScroll();
      },
    });

    this.pageScrollStepper = new Stepper({
      start: this.pagesScrollTop$.value,
      onStep: pageScrollTop => {
        this.pageScrollTo(pageScrollTop);
      },
    });

    this.sideEffect.addDisposer(
      this.viewer.events.on("jumpPage", pageIndex => this.userScrollToPageIndex(pageIndex))
    );
    this.sideEffect.addDisposer(this.viewer.events.on("save", () => this.toPdf()));

    this.render();

    this.setupScrollListener();

    // guard scroll position
    this.sideEffect.setTimeout(() => {
      if (!this.userScrolling) {
        this.pageScrollTo(this.pageRenderer.pagesScrollTop);
      }
    }, 100);
  }

  readonly pageRenderer: PageRenderer;
  readonly scrollbar: ScrollBar;

  protected sideEffect = new SideEffectManager();

  protected pageScrollStepper: Stepper;
  protected userScrolling = false;

  protected pages: DocsViewerPage[];
  protected box: ReadonlyTeleBox;
  protected whiteboard: WhiteBoardView;

  public onUserScroll?: (pageScrollTop: number) => void;
  public debounceOnUserScroll: () => void;

  public viewer: DocsViewer;

  public destroy(): void {
    this.sideEffect.flushAll();
    this.pageScrollStepper.destroy();
    this.onUserScroll = void 0;
    this.viewer.destroy();
    this.pageRenderer.destroy();
    this.scrollbar.destroy();
  }

  /** Sync scrollTop from writable user */
  public syncPageScrollTop(pageScrollTop: number): void {
    if (
      !this.userScrolling &&
      pageScrollTop >= 0 &&
      Math.abs(this.pagesScrollTop$.value - pageScrollTop) > 0.01
    ) {
      this.pageScrollStepper.stepTo(pageScrollTop, this.pagesScrollTop$.value);
    }
  }

  private async getBase64FromUrl(url: string): Promise<string> {
    const data = await fetch(url);
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

  public toPdf = async () => {
    const whiteSnapshotCanvas = document.createElement("canvas");
    const whiteCtx = whiteSnapshotCanvas.getContext("2d");
    if (!whiteCtx) {
      return null;
    }
    const scenePath = this.whiteboard.pageState.pages[0];
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
      this.whiteboard.view.screenshotToCanvas(whiteCtx, scenePath, width, height, {
        centerX: width / 2,
        centerY: height / 2 + index * height,
        scale: 1,
      });
      const snapshot = whiteSnapshotCanvas.toDataURL("image/png");
      pdf.addImage(pdfPageBase64, "JPEG", 0, 0, width, height, "", "FAST");
      pdf.addImage(snapshot, "PNG", 0, 0, width, height, "", "FAST");

      whiteCtx.clearRect(0, 0, width, height);
      this.viewer.events.emit("saveProgress", Math.ceil(((index + 1) / this.pages.length) * 100));
    }
    const dataUrl = pdf.output("arraybuffer");
    const blob = new Blob([dataUrl]);
    const downloadUrl = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.setAttribute("href", downloadUrl);
    element.setAttribute("download", `${this.box.title}.pdf`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    window.postMessage({ type: "@app-slide/_download_pdf_", buf: dataUrl });
  };

  public render(): void {
    this.box.$content.style.overflow = "hidden";
    this.box.mountStage(this.pageRenderer.$pages);
    this.scrollbar.mount(this.box.$body);
  }

  /** Scroll base on docs size */
  private pageScrollTo(pagesScrollTop: number): void {
    const halfWbHeight = this.whiteboard.view.size.height / 2 / this.pageRenderer.scale;
    this.whiteboard.view.moveCamera({
      centerY: clamp(
        pagesScrollTop + halfWbHeight,
        halfWbHeight,
        this.pagesSize$.value.height - halfWbHeight
      ),
      animationMode: "immediately" as AnimationMode,
    });
  }

  private userScrollToPageIndex(index: number): void {
    index = clamp(index, 0, this.pages.length - 1);
    if (!this.readonly$.value && !Number.isNaN(index)) {
      const offsetY = this.pageRenderer.pagesYs[index];
      if (offsetY >= 0) {
        this.onUserScroll?.(offsetY + 5 / this.pageRenderer.scale);
      }
    }
  }

  private userScrollByPercent(percent: number): void {
    if (!this.readonly$.value) {
      this.onUserScroll?.(
        clamp(
          this.pageRenderer.pagesScrollTop +
            (this.pageRenderer.containerRect.height / this.pageRenderer.scale) *
              clamp(percent, -1, 1),
          0,
          this.pageRenderer.pagesSize.height -
            this.pageRenderer.containerRect.height / this.pageRenderer.scale
        )
      );
    }
  }

  protected setupScrollListener(): void {
    this.sideEffect.addEventListener(
      this.box.$main,
      "wheel",
      ev => {
        preventEvent(ev);
        if (!this.readonly$.value && this.pageScrollStepper.paused) {
          this.pageScrollTo(this.pagesScrollTop + ev.deltaY);
          this.debounceOnUserScroll();
        }
      },
      { passive: false }
    );

    this.sideEffect.addEventListener(
      this.box.$main,
      "touchmove",
      ev => {
        if (!this.readonly$.value && ev.touches.length > 1) {
          this.debounceOnUserScroll();
        }
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
          camera.centerY - this.pageRenderer.containerRect.height / this.pageRenderer.scale / 2;
        this.pagesScrollTop$.setValue(Math.max(0, pagesScrollTop));
      };
      this.whiteboard.view.callbacks.on("onCameraUpdated", handleCameraUpdate);
      return () => this.whiteboard.view.callbacks.off("onCameraUpdated", handleCameraUpdate);
    });

    this.sideEffect.addDisposer(
      this.box._stageRect$.subscribe(stageRect => {
        const { width: pagesIntrinsicWidth, height: pagesIntrinsicHeight } = this.pagesSize$.value;

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
        if (this.readonly$.value || !this.box.focus || this.box.minimized) {
          return;
        }
        switch (ev.key) {
          case "PageDown": {
            this.userScrollByPercent(0.8);
            break;
          }
          case "PageUp": {
            this.userScrollByPercent(-0.8);
            break;
          }
          case "ArrowLeft": {
            this.userScrollByPercent(-0.25);
            break;
          }
          case "ArrowRight": {
            this.userScrollByPercent(0.25);
            break;
          }
          case "ArrowDown": {
            this.userScrollByPercent(0.5);
            break;
          }
          case "ArrowUp": {
            this.userScrollByPercent(-0.5);
            break;
          }
          default:
            break;
        }
      },
      { capture: true }
    );
  }

  private wrapClassName(className: string): string {
    return "netless-app-docs-viewer-static-" + className;
  }
}
