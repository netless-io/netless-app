import { SideEffectManager } from "side-effect-manager";
import { Slide, SLIDE_EVENTS } from "@netless/slide";
import { DocsViewer } from "../DocsViewer";
import { createDocsViewerPages, DefaultUrl } from "../SlideController";
import { cachedGetBgColor } from "../utils/bgcolor";
import { clamp } from "../utils/helpers";
import { log } from "../utils/logger";
import style from "../style.scss?inline";

export interface PreviewParams {
  container: HTMLElement;
  taskId: string;
  url?: string;
  debug?: boolean;
}

export default function previewSlide({
  container,
  taskId,
  url = DefaultUrl,
  debug = import.meta.env.DEV,
}: PreviewParams) {
  if (!taskId) {
    throw new Error("[Slide] taskId is required");
  }

  container.style.cssText += `display:flex;flex-direction:column`;
  const previewer = new SlidePreviewer({ target: container });
  previewer.debug = !!debug;

  previewer.mount(taskId, url);

  return previewer;
}

if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).previewSlide = previewSlide;
}

export class SlidePreviewer {
  public readonly viewer: DocsViewer;
  public readonly bgColor: string;
  public readonly target: HTMLElement;
  public slide: Slide | null = null;
  public debug = import.meta.env.DEV;

  public $slide!: HTMLDivElement;

  private readonly sideEffect = new SideEffectManager();

  public ready = false;
  private resolveReady!: () => void;
  public readonly readyPromise = new Promise<void>(resolve => {
    this.resolveReady = () => {
      this.ready = true;
      resolve();
    };
  });

  public constructor(config: { target: HTMLElement }) {
    this.target = config.target;
    this.bgColor = cachedGetBgColor(this.target);
    this.viewer = new DocsViewer({
      readonly: false,
      onNewPageIndex: this.onNewPageIndex,
      onPlay: this.onPlay,
    });
    this.render();
  }

  public render() {
    this.viewer.$content.appendChild(this.renderSlideContainer());
    this.sideEffect.addEventListener(window, "keydown", ev => {
      if (this.slide) {
        switch (ev.key) {
          case "ArrowUp":
          case "ArrowLeft": {
            this.slide.prevStep();
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
  }

  public mount(taskId: string, url: string) {
    this.target.appendChild(this.renderStyle());
    this.target.appendChild(this.viewer.$content);
    this.target.appendChild(this.viewer.$footer);

    this.slide = new Slide({
      anchor: this.$slide,
      interactive: false,
      mode: "local",
      resize: true,
      controller: this.debug,
      renderOptions: {
        minFPS: 25,
        maxFPS: 30,
        autoFPS: true,
        autoResolution: true,
        transactionBgColor: this.bgColor,
      },
    });

    this.registerEventListeners();

    this.slide.setResource(taskId, url);
    this.slide.renderSlide(1);
  }

  protected renderStyle(): HTMLElement {
    const element = document.createElement("style");
    element.appendChild(document.createTextNode(style));
    return element;
  }

  protected registerEventListeners() {
    if (!this.slide) return;
    const { slide } = this;

    slide.on(SLIDE_EVENTS.slideChange, this.onPageChanged);
    slide.on(SLIDE_EVENTS.renderStart, this.onTransitionStart);
    slide.on(SLIDE_EVENTS.renderEnd, this.onTransitionEnd);
    slide.on(SLIDE_EVENTS.mainSeqStepStart, this.onTransitionStart);
    slide.on(SLIDE_EVENTS.mainSeqStepEnd, this.onTransitionEnd);
    slide.on(SLIDE_EVENTS.renderError, this.onError);
    slide.on(SLIDE_EVENTS.renderEnd, this.resolveReady);

    this.readyPromise.then(this.refreshPages);
  }

  protected onPageChanged = (page: number) => {
    this.viewer.setPageIndex(page - 1);
  };

  protected onTransitionStart = () => {
    this.viewer.setPlaying();
  };

  protected onTransitionEnd = () => {
    this.viewer.setPaused();
  };

  protected onError = ({ error }: { error: Error }) => {
    this.viewer.setPaused();
    console.warn("[Slide] render error", error);
  };

  private destroyed = false;
  public destroy() {
    this.sideEffect.flushAll();
    if (this.slide && !this.destroyed) {
      log("[Slide] destroy slide (once)");
      this.slide.destroy();
      this.destroyed = true;
    }
    this.viewer.destroy();
  }

  protected refreshPages = () => {
    if (this.slide) {
      this.viewer.pages = createDocsViewerPages(this.slide);
      this.viewer.setPageIndex(this.getPageIndex(this.slide.slideState.currentSlideIndex));
    }
  };

  protected getPageIndex(page: number) {
    return (page > 0 ? page : 1) - 1;
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

  protected onPlay = () => {
    if (this.slide) {
      this.slide.nextStep();
    }
  };

  protected onNewPageIndex = (index: number) => {
    if (this.slide && this.slide.slideCount > 0) {
      this.slide.renderSlide(clamp(index + 1, 1, this.slide.slideCount));
    }
  };

  protected wrapClassName(className: string) {
    return `${this.namespace}-${className}`;
  }

  protected namespace = "netless-app-slide";
}
