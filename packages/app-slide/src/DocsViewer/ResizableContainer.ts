import { Slide } from "@netless/slide";
import { ScrollBar } from "./ScrollBar";
import type { AppContext } from "@netless/window-manager";
import type { Attributes, MagixEvents } from "../typings";
import type { AppOptions } from "../index";

export class ResizableContainer {
  private root: HTMLDivElement;
  public container: HTMLDivElement;
  private scrollContainer: HTMLDivElement;
  public onScaleChanged: ((scale: number) => void) | null = null;

  private parent: HTMLElement;
  private whiteboardContainer: HTMLDivElement | null = null;
  private slide: Slide | null = null;
  private scale = 1;
  private resizeObserver: ResizeObserver | null = null;
  private slideWidth = 1;
  private slideHeight = 1;
  private scrollBar: ScrollBar | null = null;
  private context: AppContext<Attributes, MagixEvents, AppOptions>;

  // 每次 scale 后, 重置为居中
  private translateX = 0.5;
  private translateY = 0.5;

  private enableResize: boolean;

  constructor(
    parent: HTMLElement,
    context: AppContext<Attributes, MagixEvents, AppOptions>,
    enableResize: boolean
  ) {
    this.enableResize = enableResize;
    this.parent = parent;
    this.context = context;
    this.root = document.createElement("div");
    this.root.style.width = "100%";
    this.root.style.height = "100%";
    this.root.style.overflow = "hidden";
    this.parent.appendChild(this.root);
    this.scrollContainer = document.createElement("div");
    this.scrollContainer.setAttribute("data-resizable-scroll", "true");
    this.scrollContainer.style.width = "100%";
    this.scrollContainer.style.height = "100%";
    this.scrollContainer.style.position = "relative";
    this.scrollContainer.style.overflow = "hidden";
    this.container = document.createElement("div");
    this.container.style.position = "relative";
    this.container.setAttribute("data-resizable-container", "true");
    this.scrollContainer.appendChild(this.container);
    this.root.appendChild(this.scrollContainer);

    if (this.enableResize) {
      // 初始化滚动条
      this.scrollBar = new ScrollBar(this.root, this);
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.updateResizableContainer();
    });
    this.resizeObserver.observe(this.scrollContainer);

  }

  public getTranslate(): { x: number; y: number } {
    return { x: this.translateX, y: this.translateY };
  }

  public getScale(): number {
    return this.scale;
  }

  private renderScrollBar(
    width: number,
    overflowWidth: number,
    height: number,
    overflowHeight: number
  ): void {
    if (this.scrollBar) {
      this.scrollBar.render(width, height, overflowWidth, overflowHeight);
    }
  }

  public setSlideObject(slide: Slide) {
    this.slide = slide;
    this.slide.on("renderEnd", this.updateSlideSize);
  }

  private updateSlideSize = () => {
    if (this.slide) {
      let updateContainer = false;
      if (this.slideWidth !== this.slide.width || this.slideHeight !== this.slide.height) {
        this.slideWidth = this.slide.width;
        this.slideHeight = this.slide.height;
        updateContainer = true;
      }
      if (updateContainer) {
        this.updateResizableContainer();
      }
    }
  };

  public updateResizableContainer() {
    const parentBounds = this.scrollContainer.getBoundingClientRect();
    this.container.style.width = `${parentBounds.width * this.scale}px`;
    this.container.style.height = `${parentBounds.height * this.scale}px`;

    if (this.whiteboardContainer && this.enableResize) {
      const whiteboardBounds = this.whiteboardContainer.getBoundingClientRect();
      if (whiteboardBounds.width / whiteboardBounds.height > this.slideWidth / this.slideHeight) {
        // 裁剪两边
        const renderWidth = (whiteboardBounds.height * this.slideWidth) / this.slideHeight;
        const padding = (whiteboardBounds.width - renderWidth) / 2;
        this.whiteboardContainer.style.clipPath = `inset(0px ${padding}px 0px ${padding}px)`;
      } else if (
        whiteboardBounds.width / whiteboardBounds.height <
        this.slideWidth / this.slideHeight
      ) {
        // 裁剪上下
        const renderHeight = (whiteboardBounds.width * this.slideHeight) / this.slideWidth;
        const padding = (whiteboardBounds.height - renderHeight) / 2;
        this.whiteboardContainer.style.clipPath = `inset(${padding}px 0px ${padding}px 0px)`;
      }
    }

    this.translateX = 0.5;
    this.translateY = 0.5;

    this.renderScrollBar(
      parentBounds.width,
      parentBounds.width * this.scale,
      parentBounds.height,
      parentBounds.height * this.scale
    );
    this.handleNormalizeTranslate(this.translateX, this.translateY, {
      triggerScrollBar: true,
      triggerSync: true,
    });
  }

  // x, y 范围 0 ~ 1
  public handleNormalizeTranslate(
    x: number,
    y: number,
    options: {
      triggerScrollBar: boolean;
      triggerSync: boolean;
    }
  ) {
    if (
      Math.abs(x - this.translateX) < 0.001 &&
      Math.abs(y - this.translateY) < 0.001 &&
      !options.triggerSync
    ) {
      return;
    }
    const parentBounds = this.scrollContainer.getBoundingClientRect();
    const selfBounds = this.container.getBoundingClientRect();
    const translateX = -x * (selfBounds.width - parentBounds.width);
    const translateY = -y * (selfBounds.height - parentBounds.height);
    this.translateX = x;
    this.translateY = y;
    this.container.style.transform = `translate(${translateX}px, ${translateY}px)`;
    if (options.triggerScrollBar) {
      this.scrollBar?.handleNormalizeTranslate(x, y);
    }
    if (options.triggerSync && this.enableResize && this.context.getIsWritable()) {
      this.context.storage.setState({ translateX: this.translateX, translateY: this.translateY });
    }
  }

  public scaleContainer(applyScale: number) {
    if (Math.abs(this.scale - applyScale) < 0.001 || !this.enableResize) {
      return;
    }
    if (applyScale > 1.0) {
      this.scrollContainer.style.width = "calc(100% - 6px)";
      this.scrollContainer.style.height = "calc(100% - 6px)";
    } else {
      this.scrollContainer.style.width = "100%";
      this.scrollContainer.style.height = "100%";
    }
    applyScale = this.enableResize ? applyScale : 1;
    if (this.onScaleChanged && this.enableResize) {
      this.onScaleChanged(applyScale);
    }
    this.scale = applyScale;
    setTimeout(() => {
      this.updateResizableContainer();
    });
  }

  public addSlideContainer(slideContainer: HTMLDivElement) {
    this.container.appendChild(slideContainer);
  }

  public addWhiteboardContainer(whiteboardContainer: HTMLDivElement) {
    this.container.appendChild(whiteboardContainer);
    this.whiteboardContainer = whiteboardContainer;
  }

  public getCurrentScale(): number {
    return this.scale;
  }

  public destroy(): void {
    this.resizeObserver?.disconnect();
    this.scrollBar?.destroy();
  }
}
