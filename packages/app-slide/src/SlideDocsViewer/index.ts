import type { ReadonlyTeleBox, View, Displayer, AnimationMode } from "@netless/window-manager";
import type { DocsViewerPage } from "../DocsViewer";

import type { Slide } from "@netless/slide";
import { SLIDE_EVENTS } from "@netless/slide";
import { SideEffectManager } from "side-effect-manager";
import { DocsViewer } from "../DocsViewer";
import { clamp } from "../utils/helpers";

export interface SlideDocsViewerConfig {
  displayer: Displayer;
  whiteboardView: View;
  readonly: boolean;
  box: ReadonlyTeleBox;
  createSlide: (anchor: HTMLDivElement, initialSlideIndex: number) => Slide;
  setSceneIndex: (index: number) => void;
  mountWhiteboard: (dom: HTMLDivElement) => void;
  refreshScenes: () => void;
}

export class SlideDocsViewer {
  public constructor({
    displayer,
    whiteboardView,
    readonly,
    box,
    createSlide,
    setSceneIndex,
    mountWhiteboard,
    refreshScenes,
  }: SlideDocsViewerConfig) {
    this.whiteboardView = whiteboardView;
    this.readonly = readonly;
    this.box = box;
    this.displayer = displayer;
    this.createSlide = createSlide;
    this.setSceneIndex = setSceneIndex;
    this.mountWhiteboard = mountWhiteboard;
    this.refreshScenes = refreshScenes;

    this.viewer = new DocsViewer({
      readonly,
      box,
      onNewPageIndex: this.onNewPageIndex,
      onPlay: this.onPlayPPT,
    });

    this.render();
  }

  protected sideEffect = new SideEffectManager();

  protected slide!: Slide;
  protected createSlide: (anchor: HTMLDivElement, initialSlideIndex: number) => Slide;
  protected readonly: boolean;
  protected box: ReadonlyTeleBox;
  protected whiteboardView: View;
  protected displayer: Displayer;
  protected setSceneIndex: (index: number) => void;
  protected mountWhiteboard: (dom: HTMLDivElement) => void;
  protected refreshScenes: () => void;

  public set pages(value: DocsViewerPage[]) {
    this.viewer.pages = value;
  }

  public get pages() {
    return this.viewer.pages;
  }

  public viewer: DocsViewer;

  public $slide!: HTMLDivElement;
  public $mask!: HTMLElement;
  public $whiteboardView!: HTMLDivElement;

  public mount(): this {
    this.viewer.mount();
    this.slide = this.createSlide(this.$slide, this.getPageIndex() + 1);

    this.jumpToPage(this.getPageIndex());

    this.scaleDocsToFit();
    this.sideEffect.add(() => {
      this.whiteboardView.callbacks.on("onSizeUpdated", this.scaleDocsToFit);
      return () => {
        this.whiteboardView.callbacks.off("onSizeUpdated", this.scaleDocsToFit);
      };
    });

    this.slide.on(SLIDE_EVENTS.slideChange, this.onSlideChange);
    this.slide.on(SLIDE_EVENTS.mainSeqStepStart, this.setPlaying);
    this.slide.on(SLIDE_EVENTS.mainSeqStepEnd, this.setPaused);
    this.slide.on(SLIDE_EVENTS.renderStart, this.setPlaying);
    this.slide.on(SLIDE_EVENTS.renderEnd, this.setPaused);
    this.slide.on(SLIDE_EVENTS.renderError, err => {
      console.warn("[Slide] render error", err);
    });

    return this;
  }

  public setPlaying = (): void => {
    this.viewer.setPlaying();
  };

  public setPaused = (): void => {
    this.viewer.setPaused();
  };

  public makePages(): DocsViewerPage[] {
    const { width, height, slideCount, slideState } = this.slide;
    const { taskId, url } = slideState;
    const pages: DocsViewerPage[] = [];
    for (let i = 1; i <= slideCount; ++i) {
      pages.push({ width, height, thumbnail: `${url}/${taskId}/preview/${i}.png`, src: "ppt" });
    }
    return pages;
  }

  public onSlideChange = (page: number): void => {
    if (this.slide.slideCount !== this.pages.length) {
      this.pages = this.makePages();
    }
    this.refreshScenes();
    this.updateSlideScale();
    if (this.getPageIndex() !== page - 1) {
      this.setSceneIndex(page - 1);
    }
    this.viewer.setPageIndex(page - 1);
  };

  public unmount(): this {
    this.slide.destroy();
    this.viewer.unmount();
    return this;
  }

  public setReadonly(readonly: boolean): void {
    if (this.readonly !== readonly) {
      this.readonly = readonly;

      this.viewer.setReadonly(readonly);
    }
  }

  public destroy(): void {
    this.sideEffect.flushAll();
    this.unmount();
    this.viewer.destroy();
  }

  public getPageIndex(): number {
    return this.displayer.state.sceneState.index;
  }

  public jumpToPage(index: number): void {
    if (this.pages.length <= 0) {
      return;
    }
    index = clamp(index, 0, this.pages.length - 1);
    if (index !== this.getPageIndex()) {
      this.slide.renderSlide(index + 1);
      this.setSceneIndex(index);
      this.scaleDocsToFit();
    }
    if (index !== this.viewer.pageIndex) {
      this.viewer.setPageIndex(index);
    }
  }

  public onPlayPPT = (): void => {
    return this.slide.nextStep();
  };

  public render(): void {
    this.viewer.$content.appendChild(this.renderSlideContainer());
    this.viewer.$content.appendChild(this.renderMask());
    this.viewer.$content.appendChild(this.renderWhiteboardView());
    this.sideEffect.addEventListener(window, "keydown", ev => {
      if (this.box.focus) {
        switch (ev.key) {
          case "ArrowUp":
          case "ArrowLeft": {
            this.jumpToPage(this.getPageIndex());
            break;
          }
          case "ArrowRight":
          case "ArrowDown": {
            this.slide.nextStep();
            break;
          }
          default: {
            break;
          }
        }
      }
    });
    this.sideEffect.add(() => {
      const resizeObserver = new ResizeObserver(this.updateSlideScale);
      resizeObserver.observe(this.$slide);
      return () => resizeObserver.disconnect();
    });
  }

  protected updateSlideScale = () => {
    const { width, height } = this.$slide.getBoundingClientRect();
    const { scrollWidth, scrollHeight } = this.slide.view;
    const scale = Math.min(width / scrollWidth, height / scrollHeight);
    this.$slide.style.setProperty("--netless-app-slide-scale", String(scale));
  };

  protected renderSlideContainer(): HTMLDivElement {
    if (!this.$slide) {
      const $slide = document.createElement("div");
      $slide.className = this.wrapClassName("slide");
      $slide.dataset.appKind = "Slide";
      this.$slide = $slide;
    }
    return this.$slide;
  }

  protected renderMask(): HTMLElement {
    if (!this.$mask) {
      const $mask = document.createElement("div");
      $mask.className = this.wrapClassName("mask");
      this.$mask = $mask;

      const $back = document.createElement("button");
      $back.className = this.wrapClassName("back");

      const $next = document.createElement("button");
      $next.className = this.wrapClassName("next");

      // this.$mask.appendChild($back)
      // this.$mask.appendChild($next)
    }
    return this.$mask;
  }

  protected renderWhiteboardView(): HTMLDivElement {
    if (!this.$whiteboardView) {
      this.$whiteboardView = document.createElement("div");
      this.$whiteboardView.className = this.wrapClassName("wb-view");
      this.mountWhiteboard(this.$whiteboardView);
    }
    return this.$whiteboardView;
  }

  protected _scaleDocsToFitImpl = (): void => {
    const page = this.slide;
    if (page) {
      this.whiteboardView.moveCameraToContain({
        originX: -page.width / 2,
        originY: -page.height / 2,
        width: page.width,
        height: page.height,
        animationMode: "immediately" as AnimationMode,
      });
    }
  };

  protected _scaleDocsToFitDebounced = (): void => {
    this.sideEffect.setTimeout(this._scaleDocsToFitImpl, 1000, "_scaleDocsToFitDebounced");
  };

  protected scaleDocsToFit = (): void => {
    this._scaleDocsToFitImpl();
    this._scaleDocsToFitDebounced();
  };

  protected onNewPageIndex = (index: number): void => {
    this.jumpToPage(index);
  };

  protected wrapClassName(className: string): string {
    return "netless-app-slide-" + className;
  }
}
