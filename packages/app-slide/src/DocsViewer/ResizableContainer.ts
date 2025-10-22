export class ResizableContainer {

  public container: HTMLDivElement;
  private parent: HTMLElement;
  private scale: number = 1;
  private slideTranslateX: number = 0;
  private slideTranslateY: number = 0;
  private whiteboardTranslateX: number = 0;
  private whiteboardTranslateY: number = 0;
  private resizeObserver: ResizeObserver;
  private slideContainer: HTMLDivElement | null = null;
  private whiteboardContainer: HTMLDivElement | null = null;
  private slideLayout: () => void = () => {
    //ignore
  };

  constructor(parent: HTMLElement) {
    this.parent = parent;
    this.container = document.createElement('div');
    this.setupContainer();
    this.setupParentResizeObserver();
  }

  private setupContainer(): void {
    this.container.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      user-select: none;
      touch-action: none;
      transform-origin: center center;
    `;
    this.container.setAttribute('data-resizable-container', 'true');
    this.parent.appendChild(this.container);
  }

  private setupParentResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.target === this.parent) {
          this.updateContainers();
        }
      }
    });
    this.resizeObserver.observe(this.parent);
  }


  /**
   * 缩放到指定比例并更新容器显示
   * @param to 目标缩放比例
   * @param centerX 缩放中心的 X 坐标（可选，默认为容器中心）
   * @param centerY 缩放中心的 Y 坐标（可选，默认为容器中心）
   */
  public scaleContainer(to: number, centerX?: number, centerY?: number): void {
    const newScale = Math.max(0.1, Math.min(4, to)); // 限制缩放范围 0.1x - 4.0x

    if (newScale === this.scale) {
      return; // 如果缩放比例没有变化，直接返回
    }

    // 记录缩放前的容器位置和尺寸
    const containerRect = this.container.getBoundingClientRect();

    // 如果没有提供缩放中心，使用容器中心
    const relativeX = centerX !== undefined ? centerX - containerRect.left : containerRect.width / 2;
    const relativeY = centerY !== undefined ? centerY - containerRect.top : containerRect.height / 2;

    // 计算缩放比例
    const scaleFactor = newScale / this.scale;

    // === Slide 容器计算（使用 transform scale） ===
    let newSlideTranslateX: number;
    let newSlideTranslateY: number;

    if (newScale === 1) {
      // 当缩放为 1 时，slide 回到原点
      newSlideTranslateX = 0;
      newSlideTranslateY = 0;
    } else {
      // 计算当前 slide 在屏幕上的实际位置（考虑缩放补偿）
      const currentSlideScreenX = this.slideTranslateX / this.scale;
      const currentSlideScreenY = this.slideTranslateY / this.scale;

      // 计算缩放中心相对于 slide 内容的位置
      const centerRelativeToSlideX = relativeX - currentSlideScreenX;
      const centerRelativeToSlideY = relativeY - currentSlideScreenY;

      // 计算缩放后，缩放中心在新的 slide 坐标系中的位置
      const newCenterRelativeToSlideX = centerRelativeToSlideX * scaleFactor;
      const newCenterRelativeToSlideY = centerRelativeToSlideY * scaleFactor;

      // 计算需要调整的位移，使缩放中心对应的点保持在原位置
      const requiredSlideScreenX = relativeX - newCenterRelativeToSlideX;
      const requiredSlideScreenY = relativeY - newCenterRelativeToSlideY;

      // 计算新的 slide 逻辑位置（考虑缩放补偿的逆运算）
      newSlideTranslateX = requiredSlideScreenX * newScale;
      newSlideTranslateY = requiredSlideScreenY * newScale;
    }

    // === 更新状态：Slide 和 Whiteboard 联动处理 ===
    this.scale = newScale;
    this.slideTranslateX = newSlideTranslateX;
    this.slideTranslateY = newSlideTranslateY;
    // whiteboardTranslateX 和 whiteboardTranslateY 根据居中逻辑计算

    // === 直接更新容器显示（合并 updateContainers 逻辑） ===

    // 更新 Slide container 使用 transform scale + translate
    if (this.slideContainer) {
      // 对于 transform scale，位移需要除以缩放比例来补偿缩放对位移的影响
      const adjustedSlideX = this.slideTranslateX / this.scale;
      const adjustedSlideY = this.slideTranslateY / this.scale;
      this.slideContainer.style.transform = `translate(${adjustedSlideX}px, ${adjustedSlideY}px) scale(${this.scale})`;

      // 手动触发 slide 内部的 ResizeObserver，因为 transform 不会自动触发
      this.triggerSlideResizeObserver();
    }

    // 更新 Whiteboard container 使用 width/height 缩放 + 居中逻辑
    if (this.whiteboardContainer) {
      // 获取 parent 容器的 bounding rect
      const parentRect = this.parent.getBoundingClientRect();

      // whiteboard 的尺寸应该等于 parent bounding rect 的尺寸乘以 scale
      const targetWidth = parentRect.width * this.scale;
      const targetHeight = parentRect.height * this.scale;

      // 设置 whiteboard 的尺寸
      this.whiteboardContainer.style.width = `${targetWidth}px`;
      this.whiteboardContainer.style.height = `${targetHeight}px`;

      // 白板居中逻辑：计算居中位置 = (parent尺寸 - scaled白板尺寸) / 2
      const centerX = (parentRect.width - targetWidth) / 2;
      const centerY = (parentRect.height - targetHeight) / 2;

      // 设置 whiteboard 居中
      this.whiteboardContainer.style.transform = `translate(${centerX}px, ${centerY}px)`;

      // 更新 whiteboardTranslateX 和 whiteboardTranslateY 为居中位置
      this.whiteboardTranslateX = centerX;
      this.whiteboardTranslateY = centerY;
    }
  }

  /**
   * 更新容器显示（不计算新的缩放值，只应用当前状态）
   */
  private updateContainers(): void {
    // 更新 Slide container 使用 transform scale + translate
    if (this.slideContainer) {
      // 对于 transform scale，位移需要除以缩放比例来补偿缩放对位移的影响
      const adjustedSlideX = this.slideTranslateX / this.scale;
      const adjustedSlideY = this.slideTranslateY / this.scale;
      this.slideContainer.style.transform = `translate(${adjustedSlideX}px, ${adjustedSlideY}px) scale(${this.scale})`;

      // 手动触发 slide 内部的 ResizeObserver，因为 transform 不会自动触发
      this.triggerSlideResizeObserver();
    }

    // 更新 Whiteboard container 使用 width/height 缩放 + 居中逻辑
    if (this.whiteboardContainer) {
      // 获取 parent 容器的 bounding rect
      const parentRect = this.parent.getBoundingClientRect();

      // whiteboard 的尺寸应该等于 parent bounding rect 的尺寸乘以 scale
      const targetWidth = parentRect.width * this.scale;
      const targetHeight = parentRect.height * this.scale;

      // 设置 whiteboard 的尺寸
      this.whiteboardContainer.style.width = `${targetWidth}px`;
      this.whiteboardContainer.style.height = `${targetHeight}px`;

      // 白板居中逻辑：计算居中位置 = (parent尺寸 - scaled白板尺寸) / 2
      const centerX = (parentRect.width - targetWidth) / 2;
      const centerY = (parentRect.height - targetHeight) / 2;

      // 设置 whiteboard 居中
      this.whiteboardContainer.style.transform = `translate(${centerX}px, ${centerY}px)`;

      // 更新 whiteboardTranslateX 和 whiteboardTranslateY 为居中位置
      this.whiteboardTranslateX = centerX;
      this.whiteboardTranslateY = centerY;
    }
  }

  /**
   * 手动触发 slide 内部的 ResizeObserver
   * 因为 transform scale 不会自动触发 ResizeObserver
   */
  private triggerSlideResizeObserver(): void {
    if (!this.slideContainer) return;

    // 先设置 CSS width 为 100% + 1px
    this.slideContainer.style.width = 'calc(100% + 1px)';
    this.slideContainer.style.height = 'calc(100% + 1px)';

    // 然后用 setTimeout 修改回来
    setTimeout(() => {
      if (this.slideContainer) {
        // 恢复原始尺寸
        this.slideContainer.style.width = "100%";
        this.slideContainer.style.height = "100%";
      }
      this.slideLayout();
    }, 50); // 使用 0ms setTimeout，在下一个事件循环中执行
  }

  /**
   * 获取当前缩放比例
   */
  public getScale(): number {
    return this.scale;
  }

  /**
   * 设置 slide 容器的位移（whiteboard 会自动居中）
   * @param x X 轴位移
   * @param y Y 轴位移
   */
  public setTranslation(x: number, y: number): void {
    this.slideTranslateX = x;
    this.slideTranslateY = y;
    // whiteboardTranslateX 和 whiteboardTranslateY 会在 updateContainers 中根据居中逻辑重新计算
    this.updateContainers();
  }

  /**
   * 获取当前位移
   */
  public getTranslation(): { x: number; y: number } {
    return {
      x: this.slideTranslateX,
      y: this.slideTranslateY
    };
  }

  public addSlideContainer($slideContainer: HTMLDivElement, slideLayout: () => void): void {
    this.slideContainer = $slideContainer;
    this.slideContainer.style.transformOrigin = 'top left';
    this.slideLayout = slideLayout;
    this.container.appendChild(this.slideContainer);
  }

  public addWhiteboardContainer($whiteboardContainer: HTMLDivElement): void {
    this.whiteboardContainer = $whiteboardContainer;

    // 统一使用 top-left 作为 transform origin
    this.whiteboardContainer.style.transformOrigin = 'top left';

    this.container.appendChild(this.whiteboardContainer);
  }

  public removeSlideContainer(): void {
    if (this.slideContainer) {
      this.container.removeChild(this.slideContainer);
      this.slideContainer = null;
    }
  }

  public removeWhiteboardContainer(): void {
    if (this.whiteboardContainer) {
      this.container.removeChild(this.whiteboardContainer);
      this.whiteboardContainer = null;
    }
  }

  public reset(): void {
    this.slideTranslateX = 0;
    this.slideTranslateY = 0;
    this.whiteboardTranslateX = 0;
    this.whiteboardTranslateY = 0;
    this.scale = 1;

    // 重置两个容器
    this.updateContainers();
  }

  public destroy(): void {
    this.resizeObserver?.disconnect();
    this.container.remove();
  }

}
