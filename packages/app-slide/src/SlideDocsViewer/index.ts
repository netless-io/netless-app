import type { ReadonlyTeleBox, AnimationMode, View } from "@netless/window-manager";
import type { SlideController, SlideControllerOptions } from "../SlideController";

import { SideEffectManager } from "side-effect-manager";
import { createDocsViewerPages } from "../SlideController";
import { DocsViewer } from "../DocsViewer";

export const ClickThroughAppliances = new Set(["clicker"]);

export type MountSlideOptions = Omit<SlideControllerOptions, "context" | "onPageChanged"> & {
  onReady: () => void;
};

export interface SlideDocsViewerConfig {
  box: ReadonlyTeleBox;
  view: View;
  mountSlideController: (options: MountSlideOptions) => SlideController;
  mountWhiteboard: (dom: HTMLDivElement) => void;
}

export class SlideDocsViewer {
  public viewer: DocsViewer;
  public slideController: SlideController | null = null;

  protected readonly box: ReadonlyTeleBox;
  protected readonly whiteboardView: SlideDocsViewerConfig["view"];
  protected readonly mountSlideController: SlideDocsViewerConfig["mountSlideController"];
  protected readonly mountWhiteboard: SlideDocsViewerConfig["mountWhiteboard"];
  private isViewMounted = false;

  public constructor({ box, view, mountSlideController, mountWhiteboard }: SlideDocsViewerConfig) {
    this.box = box;
    this.whiteboardView = view;
    this.mountSlideController = mountSlideController;
    this.mountWhiteboard = mountWhiteboard;

    this.viewer = new DocsViewer({
      readonly: box.readonly,
      onNewPageIndex: this.onNewPageIndex,
      onPlay: this.onPlay,
    });

    this.sideEffect.add(() => {
      const handler = (readonly: boolean): void => {
        this.setReadonly(readonly);
      };
      box.events.on("readonly", handler);
      return () => box.events.off("readonly", handler);
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
    }
    return this.$whiteboardView;
  }

  public mount() {
    this.box.mountContent(this.viewer.$content);
    this.box.mountFooter(this.viewer.$footer);

    this.slideController = this.mountSlideController({
      anchor: this.$slide,
      onTransitionStart: this.viewer.setPlaying,
      onTransitionEnd: this.viewer.setPaused,
      onReady: this.refreshPages,
      onError: this.onError,
    });

    this.scaleDocsToFit();
    this.sideEffect.add(() => {
      this.whiteboardView.callbacks.on("onSizeUpdated", this.scaleDocsToFit);
      return () => this.whiteboardView.callbacks.off("onSizeUpdated", this.scaleDocsToFit);
    });

    return this;
  }

  protected onError = ({ error }: { error: Error }) => {
    this.viewer.setPaused();
    console.warn("[Slide] render error", error);
  };

  protected refreshPages = () => {
    if (this.slideController) {
      this.viewer.pages = createDocsViewerPages(this.slideController.slide);
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
