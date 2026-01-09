import { ResizableContainer } from "./ResizableContainer";

export class ScrollBar {
  private container: HTMLElement;
  private horizontalScrollBar: HTMLDivElement | null = null;
  private verticalScrollBar: HTMLDivElement | null = null;
  private resizableContainer: ResizableContainer;

  // 跟踪拖动状态 - 分别跟踪水平和垂直滚动条
  private isDraggingHorizontal = false;
  private isDraggingVertical = false;

  // 跟踪事件监听器以便清理
  private eventListeners: Array<{
    element: HTMLElement | Document;
    type: string;
    listener: (e: Event) => void;
  }> = [];

  constructor(container: HTMLElement, resizableContainer: ResizableContainer) {
    this.container = container;
    this.resizableContainer = resizableContainer;
  }

  /**
   * 添加事件监听器并跟踪引用
   */
  private addTrackedListener<T extends HTMLElement | Document>(
    element: T,
    type: string,
    listener: (e: any) => void
  ): void {
    element.addEventListener(type, listener);
    this.eventListeners.push({ element, type, listener });
  }

  /**
   * 移除所有跟踪的事件监听器
   */
  private removeAllListeners(): void {
    this.eventListeners.forEach(({ element, type, listener }) => {
      element.removeEventListener(type, listener);
    });
    this.eventListeners = [];
  }

  /**
   * 渲染滚动条
   * @param containerWidth 容器宽度
   * @param containerHeight 容器高度
   * @param contentWidth 内容宽度
   * @param contentHeight 内容高度
   */
  public render(
    containerWidth: number,
    containerHeight: number,
    contentWidth: number,
    contentHeight: number
  ): void {
    this.clearScrollBars();

    // 水平滚动条
    if (contentWidth > containerWidth) {
      this.createHorizontalScrollBar(containerWidth, contentWidth);
    }

    // 垂直滚动条
    if (contentHeight > containerHeight) {
      this.createVerticalScrollBar(containerHeight, contentHeight);
    }
  }

  public handleNormalizeTranslate(x: number, y: number) {
    // 确保坐标在有效范围内
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));

    // 更新水平滚动条 thumb 位置
    if (this.horizontalScrollBar) {
      const thumb = this.horizontalScrollBar.querySelector(".horizontal-thumb") as HTMLElement;
      if (thumb) {
        const trackWidth = this.horizontalScrollBar.offsetWidth;
        const thumbWidth = thumb.offsetWidth;
        const maxPosition = trackWidth - thumbWidth - 2; // 减去边距
        if (maxPosition > 0) {
          const newPosition = 1 + clampedX * maxPosition; // 1 是左边距
          thumb.style.left = `${newPosition}px`;
        }
      }
    }

    // 更新垂直滚动条 thumb 位置
    if (this.verticalScrollBar) {
      const thumb = this.verticalScrollBar.querySelector(".vertical-thumb") as HTMLElement;
      if (thumb) {
        const trackHeight = this.verticalScrollBar.offsetHeight;
        const thumbHeight = thumb.offsetHeight;
        const maxPosition = trackHeight - thumbHeight - 2; // 减去边距
        if (maxPosition > 0) {
          const newPosition = 1 + clampedY * maxPosition; // 1 是上边距
          thumb.style.top = `${newPosition}px`;
        }
      }
    }
  }

  private clearScrollBars(): void {
    // 清理所有事件监听器
    this.removeAllListeners();

    if (this.horizontalScrollBar) {
      this.horizontalScrollBar.remove();
      this.horizontalScrollBar = null;
    }
    if (this.verticalScrollBar) {
      this.verticalScrollBar.remove();
      this.verticalScrollBar = null;
    }
  }

  private createHorizontalScrollBar(containerWidth: number, contentWidth: number): void {
    const scrollBar = document.createElement("div");
    scrollBar.className = "scroll-bar horizontal";

    // 计算滚动条thumb宽度
    const availableWidth = containerWidth;
    const trackWidth = availableWidth;
    const thumbWidth = Math.max(
      30,
      Math.min(trackWidth, (trackWidth * availableWidth) / contentWidth)
    );

    // 滚动条轨道
    scrollBar.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      width: ${trackWidth}px;
      height: 6px;
      z-index: 1000;
      cursor: pointer;
      opacity: 1;
      transition: opacity 0.2s ease;
    `;

    // 滚动条始终显示，无需 hover 效果

    // 滚动条thumb
    const thumb = document.createElement("div");
    thumb.className = "scroll-bar-thumb horizontal-thumb";
    thumb.style.cssText = `
      position: absolute;
      bottom: 0px;
      left: 0px;
      width: ${thumbWidth}px;
      height: 6px;
      background: #9E9E9E;
      border-radius: 4px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
      cursor: grab;
    `;

    // 添加拖动事件
    this.addThumbDragListener(thumb, "horizontal", thumbWidth, trackWidth);

    scrollBar.appendChild(thumb);
    this.container.appendChild(scrollBar);
    this.horizontalScrollBar = scrollBar;
  }

  private createVerticalScrollBar(containerHeight: number, contentHeight: number): void {
    const scrollBar = document.createElement("div");
    scrollBar.className = "scroll-bar vertical";

    // 计算滚动条thumb高度
    const availableHeight = containerHeight;
    const trackHeight = availableHeight;
    const thumbHeight = Math.max(
      30,
      Math.min(trackHeight, (trackHeight * availableHeight) / contentHeight)
    );

    // 滚动条轨道
    scrollBar.style.cssText = `
      position: absolute;
      top: 0;
      right: 0;
      width: 6px;
      height: ${trackHeight}px;
      z-index: 1000;
      cursor: pointer;
      opacity: 1;
      transition: opacity 0.2s ease;
    `;

    // 滚动条始终显示，无需 hover 效果

    // 滚动条thumb
    const thumb = document.createElement("div");
    thumb.className = "scroll-bar-thumb vertical-thumb";
    thumb.style.cssText = `
      position: absolute;
      top: 1px;
      left: 0px;
      width: 6px;
      height: ${thumbHeight}px;
      background: #9E9E9E;
      border-radius: 4px;
      box-shadow: 1px 0 2px rgba(0, 0, 0, 0.2);
      cursor: grab;
    `;

    // 添加拖动事件
    this.addThumbDragListener(thumb, "vertical", thumbHeight, trackHeight);

    scrollBar.appendChild(thumb);
    this.container.appendChild(scrollBar);
    this.verticalScrollBar = scrollBar;
  }

  /**
   * 为thumb添加拖动事件监听器
   */
  private addThumbDragListener(
    thumb: HTMLElement,
    orientation: "horizontal" | "vertical",
    thumbSize: number,
    trackSize: number
  ): void {
    let startPos = 0;
    let startThumbPos = 0;

    const handleStart = (clientX: number, clientY: number) => {
      if (orientation === "horizontal") {
        this.isDraggingHorizontal = true;
      } else {
        this.isDraggingVertical = true;
      }
      startPos = orientation === "horizontal" ? clientX : clientY;
      startThumbPos =
        orientation === "horizontal"
          ? parseFloat(thumb.style.left) || 0
          : parseFloat(thumb.style.top) || 0;

      thumb.style.cursor = "grabbing";
    };

    const handleMove = (clientX: number, clientY: number) => {
      const isDragging =
        orientation === "horizontal" ? this.isDraggingHorizontal : this.isDraggingVertical;
      if (!isDragging) return;

      const currentPos = orientation === "horizontal" ? clientX : clientY;
      const delta = currentPos - startPos;

      // 计算新的thumb位置
      let newThumbPos = startThumbPos + delta;
      newThumbPos = Math.max(1, Math.min(trackSize - thumbSize - 1, newThumbPos));

      // 更新thumb位置
      if (orientation === "horizontal") {
        thumb.style.left = `${newThumbPos}px`;
      } else {
        thumb.style.top = `${newThumbPos}px`;
      }

      // 计算滚动比例 (0 到 1)
      const maxScroll = trackSize - thumbSize - 2;
      let scrollRatio = 0;
      if (maxScroll > 0) {
        scrollRatio = (newThumbPos - 1) / maxScroll;
        scrollRatio = Math.max(0, Math.min(1, scrollRatio)); // 确保在 0-1 范围内
      }

      // 调用ResizableContainer的handleNormalizeTranslate方法，传入 false 避免循环调用
      if (orientation === "horizontal") {
        this.resizableContainer.handleNormalizeTranslate(
          scrollRatio,
          this.resizableContainer["translateY"] ?? 0.5,
          {
            triggerScrollBar: false,
            triggerSync: true,
          }
        );
      } else {
        this.resizableContainer.handleNormalizeTranslate(
          this.resizableContainer["translateX"] ?? 0.5,
          scrollRatio,
          {
            triggerScrollBar: false,
            triggerSync: true,
          }
        );
      }
    };

    const handleEnd = () => {
      if (orientation === "horizontal") {
        this.isDraggingHorizontal = false;
      } else {
        this.isDraggingVertical = false;
      }
      thumb.style.cursor = "grab";
    };

    // 鼠标事件
    const handleMouseDown = (e: MouseEvent) => {
      handleStart(e.clientX, e.clientY);
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      handleEnd();
      // 滚动条始终显示，无需隐藏逻辑
    };

    // 添加事件监听器
    this.addTrackedListener(thumb, "mousedown", handleMouseDown);
    this.addTrackedListener(document, "mousemove", handleMouseMove);
    this.addTrackedListener(document, "mouseup", handleMouseUp);
  }

  /**
   * 销毁滚动条
   */
  public destroy(): void {
    this.clearScrollBars();
  }
}
