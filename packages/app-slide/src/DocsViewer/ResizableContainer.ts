export class ResizableContainer {

  public container: HTMLDivElement;
  private parent: HTMLElement;
  private isDragging: boolean = false;
  private isScaling: boolean = false;
  private translateX: number = 0;
  private translateY: number = 0;
  private scale: number = 1;
  private slideTranslateX: number = 0;
  private slideTranslateY: number = 0;
  private whiteboardTranslateX: number = 0;
  private whiteboardTranslateY: number = 0;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private initialTouchDistance: number = 0;
  private initialScale: number = 1;
  private wheelDeltaX: number = 0;
  private wheelDeltaY: number = 0;
  private isWheelDragging: boolean = false;
  private resizeObserver: ResizeObserver;
  private initialWidth: number = 0;
  private initialHeight: number = 0;
  private scaleTimeout: number = 0;
  private mouseX: number = 0;
  private mouseY: number = 0;
  private containerRect: DOMRect | null = null;
  private slideContainer: HTMLDivElement | null = null;
  private whiteboardContainer: HTMLDivElement | null = null;

  constructor(parent: HTMLElement) {
    this.parent = parent;
    this.container = document.createElement('div');
    this.setupContainer();
    this.setupEventListeners();
    this.setupParentResizeObserver();
    this.setDefaultSize();
  }

  private setupContainer(): void {
    this.container.style.cssText = `
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      cursor: grab;
      user-select: none;
      touch-action: none;
      transform-origin: center center;
    `;
    this.container.setAttribute('data-resizable-container', 'true');
    this.parent.appendChild(this.container);
  }


  private setupEventListeners(): void {
    // 触摸事件 - 用于拖动和缩放，监听在父元素上
    this.parent.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // 鼠标滚轮事件用于拖动和缩放，监听在父元素上
    this.parent.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

    // 监听键盘事件来停止滚轮拖动
    document.addEventListener('keyup', this.handleKeyup.bind(this));
  }

  private setupParentResizeObserver(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.target === this.parent) {
          this.updateDefaultSize();
        }
      }
    });
    this.resizeObserver.observe(this.parent);
  }

  private setDefaultSize(): void {
    // 主容器不需要固定尺寸，由子容器决定大小
    // 初始尺寸将在添加容器时记录
  }

  private updateDefaultSize(): void {
    // 不再需要限制主容器尺寸，因为子容器会自己管理大小
  }

  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      // 双指触摸 - 开始缩放
      e.preventDefault();
      this.isScaling = true;

      // 计算初始双指距离
      this.initialTouchDistance = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );

      // 记录当前缩放比例
      this.initialScale = this.scale;
    } else if (e.touches.length === 1) {
      // 单指触摸 - 准备拖动
      // 注意：这里不开始拖动，等移动时再判断
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length === 2 && this.isScaling) {
      // 双指缩放
      e.preventDefault();

      const currentDistance = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );

      const scaleDelta = currentDistance / this.initialTouchDistance;
      const newScale = Math.max(0.5, Math.min(3, this.initialScale * scaleDelta)); // 限制缩放范围 0.5x - 3x

      // 计算双指中心点作为缩放中心
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      this.updateScale(centerX, centerY, newScale);
    } else if (e.touches.length === 1 && !this.isScaling) {
      // 单指拖动
      e.preventDefault();

      if (!this.isDragging) {
        this.isDragging = true;
        this.dragStartX = e.touches[0].clientX - this.slideTranslateX;
        this.dragStartY = e.touches[0].clientY - this.slideTranslateY;
      }

      this.slideTranslateX = e.touches[0].clientX - this.dragStartX;
      this.slideTranslateY = e.touches[0].clientY - this.dragStartY;
      this.whiteboardTranslateX = this.slideTranslateX;
      this.whiteboardTranslateY = this.slideTranslateY;

      this.updateContainers();
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (e.touches.length === 0) {
      // 所有手指都离开了屏幕
      this.isDragging = false;
      this.isScaling = false;
    } else if (e.touches.length === 1 && this.isScaling) {
      // 从双指变为单指，停止缩放
      this.isScaling = false;
    }
  }

  private handleWheel(e: WheelEvent): void {
    // Ctrl/Cmd + 滚轮进行缩放
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();

      const scaleDelta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.5, Math.min(3, this.scale * scaleDelta));

      // 使用鼠标位置作为缩放中心
      this.updateScale(e.clientX, e.clientY, newScale);

      // 延迟重置缩放状态，避免连续滚动时重复记录初始尺寸
      clearTimeout(this.scaleTimeout);
      this.scaleTimeout = setTimeout(() => {
        this.isScaling = false;
      }, 150) as unknown as number;
    }
    // Shift + 滚轮进行拖动
    else if (e.shiftKey && !this.isWheelDragging) {
      e.preventDefault();
      this.isWheelDragging = true;
      this.wheelDeltaX = 0;
      this.wheelDeltaY = 0;
    }

    if (this.isWheelDragging && e.shiftKey) {
      e.preventDefault();

      this.wheelDeltaX += e.deltaX;
      this.wheelDeltaY += e.deltaY;

      this.slideTranslateX -= this.wheelDeltaX;
      this.slideTranslateY -= this.wheelDeltaY;
      this.whiteboardTranslateX = this.slideTranslateX;
      this.whiteboardTranslateY = this.slideTranslateY;

      this.updateContainers();

      this.wheelDeltaX = 0;
      this.wheelDeltaY = 0;
    }
  }

  private handleKeyup(e: KeyboardEvent): void {
    if (e.key === 'Shift') {
      this.isWheelDragging = false;
    }
  }

  private updateScale(mouseX: number, mouseY: number, newScale: number): void {
    // 记录缩放前的容器位置和尺寸
    this.containerRect = this.container.getBoundingClientRect();

    // 计算鼠标相对于容器的位置
    const relativeX = mouseX - this.containerRect.left;
    const relativeY = mouseY - this.containerRect.top;

    // 计算缩放比例
    const scaleFactor = newScale / this.scale;

    // 两个容器现在都使用相同的缩放方式，统一计算
    // 计算当前容器在屏幕上的实际位置（考虑缩放补偿）
    const currentScreenX = this.slideTranslateX / this.scale; // slide 和 whiteboard 位置相同
    const currentScreenY = this.slideTranslateY / this.scale;

    // 计算鼠标相对于内容的位置
    const mouseRelativeToContentX = relativeX - currentScreenX;
    const mouseRelativeToContentY = relativeY - currentScreenY;

    // 计算缩放后，鼠标在新的内容坐标系中的位置
    const newMouseRelativeToContentX = mouseRelativeToContentX * scaleFactor;
    const newMouseRelativeToContentY = mouseRelativeToContentY * scaleFactor;

    // 计算需要调整的位移，使鼠标位置对应的点保持在鼠标下
    const requiredScreenX = relativeX - newMouseRelativeToContentX;
    const requiredScreenY = relativeY - newMouseRelativeToContentY;

    // 计算新的逻辑位置（考虑缩放补偿的逆运算）
    const newTranslateX = requiredScreenX * newScale;
    const newTranslateY = requiredScreenY * newScale;

    // 更新状态（两个容器使用相同的位置）
    this.scale = newScale;
    this.slideTranslateX = newTranslateX;
    this.slideTranslateY = newTranslateY;
    this.whiteboardTranslateX = newTranslateX;
    this.whiteboardTranslateY = newTranslateY;

    // 分别更新两个容器
    this.updateContainers();
  }

  private updateContainers(): void {
    // Slide container 使用 transform scale + translate
    if (this.slideContainer) {
      // 对于 transform scale，位移需要除以缩放比例来补偿缩放对位移的影响
      const adjustedSlideX = this.slideTranslateX / this.scale;
      const adjustedSlideY = this.slideTranslateY / this.scale;
      this.slideContainer.style.transform = `translate(${adjustedSlideX}px, ${adjustedSlideY}px) scale(${this.scale})`;
    }

    // Whiteboard container 也使用 transform scale + translate
    if (this.whiteboardContainer) {
      // 同样使用缩放补偿，保持与 slide 一致的逻辑
      const adjustedWhiteboardX = this.whiteboardTranslateX / this.scale;
      const adjustedWhiteboardY = this.whiteboardTranslateY / this.scale;
      this.whiteboardContainer.style.transform = `translate(${adjustedWhiteboardX}px, ${adjustedWhiteboardY}px) scale(${this.scale})`;
    }
  }

  private updateTransform(): void {
    // 只应用位移，缩放通过 width/height 实现
    this.container.style.transform = `translate(${this.translateX}px, ${this.translateY}px)`;
  }

  public addSlideContainer($slideContainer: HTMLDivElement): void {
    this.slideContainer = $slideContainer;
    this.slideContainer.style.transformOrigin = 'top left';
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
    this.translateX = 0;
    this.translateY = 0;
    this.scale = 1;
    this.isDragging = false;
    this.isScaling = false;
    this.isWheelDragging = false;

    // 清理超时
    if (this.scaleTimeout) {
      clearTimeout(this.scaleTimeout);
      this.scaleTimeout = 0;
    }

    // 重置两个容器
    this.updateContainers();
  }

  public destroy(): void {
    this.resizeObserver?.disconnect();
    this.container.remove();

    // 清理超时
    if (this.scaleTimeout) {
      clearTimeout(this.scaleTimeout);
      this.scaleTimeout = 0;
    }

    // 清理所有事件监听器
    this.parent.removeEventListener('touchstart', this.handleTouchStart);
    document.removeEventListener('touchmove', this.handleTouchMove);
    document.removeEventListener('touchend', this.handleTouchEnd);
    this.parent.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('keyup', this.handleKeyup);
  }

}
