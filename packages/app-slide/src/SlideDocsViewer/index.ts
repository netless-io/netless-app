import type { ApplianceNames } from "white-web-sdk";
import type { ReadonlyTeleBox, AnimationMode, View } from "@netless/window-manager";
import type { SlideController } from "../utils/slide";

import { SideEffectManager } from "side-effect-manager";
import { createDocsViewerPages } from "../utils/slide";
import { DocsViewer } from "../DocsViewer";

const ClickThroughAppliances = new Set(["clicker", "selector"]);

export interface SlideDocsViewerConfig {
  box: ReadonlyTeleBox;
  view: View;
  mountSlideController: (anchor: HTMLDivElement) => Promise<SlideController>;
  mountWhiteboard: (dom: HTMLDivElement) => void;
}

export class SlideDocsViewer {
  public viewer: DocsViewer;
  public slideController?: SlideController;

  protected readonly box: ReadonlyTeleBox;
  protected readonly whiteboardView: SlideDocsViewerConfig["view"];
  protected readonly mountSlideController: SlideDocsViewerConfig["mountSlideController"];
  protected readonly mountWhiteboard: SlideDocsViewerConfig["mountWhiteboard"];

  public constructor({ box, view, mountSlideController, mountWhiteboard }: SlideDocsViewerConfig) {
    this.box = box;
    this.whiteboardView = view;
    this.mountSlideController = mountSlideController;
    this.mountWhiteboard = mountWhiteboard;

    this.viewer = new DocsViewer({
      box,
      readonly: box.readonly,
      onNewPageIndex: this.onNewPageIndex,
      onPlay: this.onPlay,
    });

    this.render();
  }

  public $slide!: HTMLDivElement;
  public $whiteboardView!: HTMLDivElement;

  public render() {
    this.viewer.$content.appendChild(this.renderSlideContainer());
    this.viewer.$content.appendChild(this.renderWhiteboardView());
    this.sideEffect.addEventListener(window, "keydown", ev => {
      if (this.box.focus && this.slideController) {
        switch (ev.key) {
          case "ArrowUp":
          case "ArrowLeft": {
            this.slideController.slide.prevStep();
            break;
          }
          case "ArrowRight":
          case "ArrowDown": {
            this.slideController.slide.nextStep();
            break;
          }
          default: {
            break;
          }
        }
      }
    });
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
      this.mountWhiteboard(this.$whiteboardView);
    }
    return this.$whiteboardView;
  }

  public async mount() {
    this.viewer.mount();
    this.slideController = await this.mountSlideController(this.$slide);
    this.viewer.pages = createDocsViewerPages(this.slideController.slide);

    this.scaleDocsToFit();
    this.sideEffect.add(() => {
      this.whiteboardView.callbacks.on("onSizeUpdated", this.scaleDocsToFit);
      return () => this.whiteboardView.callbacks.off("onSizeUpdated", this.scaleDocsToFit);
    });

    return this;
  }

  public unmount() {
    if (this.slideController) {
      this.slideController.destroy();
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

  public toggleClickThrough(tool?: ApplianceNames) {
    this.$whiteboardView.style.pointerEvents =
      !tool || ClickThroughAppliances.has(tool) ? "none" : "auto";
  }

  protected scaleDocsToFit = () => {
    if (this.slideController) {
      const { width, height } = this.slideController.slide;
      this.whiteboardView.moveCameraToContain({
        originX: -width / 2,
        originY: -height / 2,
        width,
        height,
        animationMode: "immediately" as AnimationMode.Immediately,
      });
    }
  };

  protected onPlay = () => {
    if (this.slideController) {
      this.slideController.slide.nextStep();
    }
  };

  protected onNewPageIndex = (index: number) => {
    if (this.slideController) {
      this.slideController.jumpToPage(index + 1);
    }
  };

  protected sideEffect = new SideEffectManager();

  protected wrapClassName(className: string) {
    return `${this.namespace}-${className}`;
  }

  protected namespace = "netless-app-slide";
}
