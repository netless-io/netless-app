export class ResizableContainer {

  public container: HTMLDivElement;
  private parent: HTMLElement;
  private isDragging: boolean = false;
  private isScaling: boolean = false;
  private isMoveDragging: boolean = false;
  private isCommandOrCtrlPressed: boolean = false;
  private isMPressed: boolean = false;
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
  private whiteboardView: any; // View instance for camera operations

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
    // 鼠标滚轮事件用于拖动和缩放，监听在父元素上
    this.parent.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

    // 监听键盘事件
    document.addEventListener('keydown', this.handleKeydown.bind(this));
    document.addEventListener('keyup', this.handleKeyup.bind(this));

    // 监听鼠标事件（用于拖动）
    this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
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
    // 检查触摸事件是否发生在我们的容器内或其子元素
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!this.container.contains(targetElement)) {
        return;
      }
    }

    console.log('[ResizableContainer] handleTouchStart', {
      touchesLength: e.touches.length,
      isScaling: this.isScaling,
      isMoveDragging: this.isMoveDragging,
      scale: this.scale,
      target: e.target
    });

    if (e.touches.length === 2) {
      // 双指触摸 - 需要判断是缩放还是拖动
      e.preventDefault();

      // 计算当前双指距离
      const currentDistance = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );

      // 如果已经处于缩放状态，检查是否要切换到拖动
      if (this.isScaling || this.isMoveDragging) {
        // 检查距离变化来判断操作类型
        const distanceChange = Math.abs(currentDistance - this.initialTouchDistance);

        if (this.isScaling && distanceChange < 10) {
          // 从缩放切换到拖动
          this.isScaling = false;
          this.isMoveDragging = true;
          // 计算双指中心点作为拖动起始位置
          this.dragStartX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - this.slideTranslateX;
          this.dragStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - this.slideTranslateY;
        } else if (this.isMoveDragging && distanceChange > 10) {
          // 从拖动切换到缩放
          this.isMoveDragging = false;
          this.isScaling = true;
          this.initialTouchDistance = currentDistance;
          this.initialScale = this.scale;
        }
      } else {
        // 初始状态，根据当前缩放状态决定默认操作
        if (this.scale > 1.2) {
          // 已经放大，优先考虑拖动
          this.isMoveDragging = true;
          this.initialTouchDistance = currentDistance;
          // 计算双指中心点作为拖动起始位置
          this.dragStartX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - this.slideTranslateX;
          this.dragStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - this.slideTranslateY;
        } else {
          // 没有放大或放大程度较低，优先考虑缩放
          this.isScaling = true;
          this.initialTouchDistance = currentDistance;
          this.initialScale = this.scale;
        }
      }
    } else if (e.touches.length === 1) {
      // 单指触摸 - 如果当前不是在移动状态，可能是开始拖动
      if (!this.isMoveDragging && !this.isScaling && this.scale > 1) {
        this.isMoveDragging = true;
        this.dragStartX = e.touches[0].clientX - this.slideTranslateX;
        this.dragStartY = e.touches[0].clientY - this.slideTranslateY;
      }
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length === 2) {
      console.log('[ResizableContainer] handleTouchMove', {
        touchesLength: e.touches.length,
        isScaling: this.isScaling,
        isMoveDragging: this.isMoveDragging
      });
    }

    if (e.touches.length === 2 && this.isScaling) {
      // 双指缩放
      e.preventDefault();

      const currentDistance = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );

      // 使用更温和的缩放计算，避免跳跃感
      const distanceRatio = currentDistance / this.initialTouchDistance;

      // 对缩放比例应用平滑函数，让缩放更线性且更慢
      const smoothScale = Math.pow(distanceRatio, 0.6); // 指数平滑，0.6让缩放更慢

      const newScale = Math.max(0.1, Math.min(2, this.initialScale * smoothScale)); // 限制缩放范围 0.1x - 2.0x

      // 计算双指中心点作为缩放中心
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      this.updateScale(centerX, centerY, newScale);
    } else if (e.touches.length === 2 && this.isMoveDragging) {
      // 双指拖动移动
      e.preventDefault();

      // 计算双指中心点作为拖动位置
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      if (!this.isDragging) {
        this.isDragging = true;
        this.dragStartX = centerX - this.slideTranslateX;
        this.dragStartY = centerY - this.slideTranslateY;
      }

      this.slideTranslateX = centerX - this.dragStartX;
      this.slideTranslateY = centerY - this.dragStartY;
      this.whiteboardTranslateX = this.slideTranslateX;
      this.whiteboardTranslateY = this.slideTranslateY;

      this.updateContainers();
    } else if (e.touches.length === 1 && !this.isScaling) {
      // 单指拖动（任何缩放级别都允许）
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
      this.isMoveDragging = false;
      this.initialTouchDistance = 0;
    } else if (e.touches.length === 1) {
      // 从双指变为单指，停止缩放或拖动
      if (this.isScaling || this.isMoveDragging) {
        this.isScaling = false;
        this.isMoveDragging = false;
        // 如果变成单指，可以继续单指拖动
        this.isMoveDragging = true;
        this.dragStartX = e.touches[0].clientX - this.slideTranslateX;
        this.dragStartY = e.touches[0].clientY - this.slideTranslateY;
      }
    }
  }

  private handleWheel(e: WheelEvent): void {

    // Ctrl/Cmd + 滚轮进行缩放（0.1 - 2.0 范围）
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();

      // 使用更温和的缩放增量，允许连续缩放
      const scaleStep = 0.01; // 每次滚动 1% 的变化，更慢的缩放速度
      const scaleDelta = e.deltaY > 0 ? (1 - scaleStep) : (1 + scaleStep);
      const newScale = Math.max(0.1, Math.min(2, this.scale * scaleDelta)); // 限制缩放范围 0.1x - 2.0x

      // 使用鼠标位置作为缩放中心
      this.updateScale(e.clientX, e.clientY, newScale);
    }
    // Mac 触摸板双指拖拽 或 Shift + 滚轮进行拖动（任何缩放级别都可以移动）
    else if ((e.deltaX !== 0 || e.deltaY !== 0) || e.shiftKey) {
      e.preventDefault();

      if (!this.isWheelDragging) {
        this.isWheelDragging = true;
        this.wheelDeltaX = 0;
        this.wheelDeltaY = 0;
      }

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

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Meta' || e.key === 'Control') {
      this.isCommandOrCtrlPressed = true;
    }
    if (e.key === 'm' || e.key === 'M') {
      this.isMPressed = true;
    }
  }

  private calculateMovementBounds() {
    // 获取容器的尺寸
    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // 获取 slide 容器的实际显示尺寸（已缩放）
    let actualContentWidth = 800; // 默认尺寸
    let actualContentHeight = 600;

    if (this.slideContainer) {
      const slideRect = this.slideContainer.getBoundingClientRect();
      actualContentWidth = slideRect.width || actualContentWidth;
      actualContentHeight = slideRect.height || actualContentHeight;
    }

    // 计算边界限制
    // 由于我们在 updateContainers 中使用了 adjustedSlideX = slideTranslateX / scale
    // 所以存储的 slideTranslateX 需要除以 scale 才是实际的 CSS transform 值

    // 实际 CSS transform X 的边界
    const maxCssX = 0; // 不允许 CSS transform X > 0（防止左边空白）
    const minCssX = containerWidth - actualContentWidth; // 允许向左移动的最大距离

    // 转换为存储的 slideTranslateX 边界（需要乘以 scale）
    const maxX = maxCssX * this.scale; // 0
    const minX = minCssX * this.scale;

    const maxCssY = 0; // 不允许 CSS transform Y > 0（防止上边空白）
    const minCssY = containerHeight - actualContentHeight; // 允许向上移动的最大距离

    const maxY = maxCssY * this.scale; // 0
    const minY = minCssY * this.scale;

    
    return {
      minX,
      maxX,
      minY,
      maxY
    };
  }

  private handleKeyup(e: KeyboardEvent): void {
    if (e.key === 'Shift') {
      this.isWheelDragging = false;
    }
    if (e.key === 'Meta' || e.key === 'Control') {
      this.isCommandOrCtrlPressed = false;
    }
    if (e.key === 'm' || e.key === 'M') {
      this.isMPressed = false;
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

    // === Slide 容器计算（使用 transform scale） ===
    // 计算当前 slide 在屏幕上的实际位置（考虑缩放补偿）
    const currentSlideScreenX = this.slideTranslateX / this.scale;
    const currentSlideScreenY = this.slideTranslateY / this.scale;

    // 计算鼠标相对于 slide 内容的位置
    const mouseRelativeToSlideX = relativeX - currentSlideScreenX;
    const mouseRelativeToSlideY = relativeY - currentSlideScreenY;

    // 计算缩放后，鼠标在新的 slide 坐标系中的位置
    const newMouseRelativeToSlideX = mouseRelativeToSlideX * scaleFactor;
    const newMouseRelativeToSlideY = mouseRelativeToSlideY * scaleFactor;

    // 计算需要调整的位移，使鼠标位置对应的点保持在鼠标下
    const requiredSlideScreenX = relativeX - newMouseRelativeToSlideX;
    const requiredSlideScreenY = relativeY - newMouseRelativeToSlideY;

    // 计算新的 slide 逻辑位置（考虑缩放补偿的逆运算）
    const newSlideTranslateX = requiredSlideScreenX * newScale;
    const newSlideTranslateY = requiredSlideScreenY * newScale;

    // === Whiteboard 容器计算（使用 width/height） ===
    // 计算当前 whiteboard 在屏幕上的位置（直接使用位移，无缩放补偿）
    const currentWhiteboardScreenX = this.whiteboardTranslateX;
    const currentWhiteboardScreenY = this.whiteboardTranslateY;

    // 计算鼠标相对于 whiteboard 内容的位置
    const mouseRelativeToWhiteboardX = relativeX - currentWhiteboardScreenX;
    const mouseRelativeToWhiteboardY = relativeY - currentWhiteboardScreenY;

    // 计算缩放后，鼠标在新的 whiteboard 坐标系中的位置
    const newMouseRelativeToWhiteboardX = mouseRelativeToWhiteboardX * scaleFactor;
    const newMouseRelativeToWhiteboardY = mouseRelativeToWhiteboardY * scaleFactor;

    // 计算需要调整的位移，使鼠标位置对应的点保持在鼠标下
    const newWhiteboardTranslateX = relativeX - newMouseRelativeToWhiteboardX;
    const newWhiteboardTranslateY = relativeY - newMouseRelativeToWhiteboardY;

    // 更新状态
    this.scale = newScale;
    this.slideTranslateX = newSlideTranslateX;
    this.slideTranslateY = newSlideTranslateY;
    this.whiteboardTranslateX = newWhiteboardTranslateX;
    this.whiteboardTranslateY = newWhiteboardTranslateY;

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

    // Whiteboard container 使用 width/height 缩放 + translate
    if (this.whiteboardContainer) {
      // 获取 slide 容器的实际尺寸作为参考基准
      let slideWidth = 800; // 默认尺寸
      let slideHeight = 600;

      if (this.slideContainer) {
        const slideRect = this.slideContainer.getBoundingClientRect();
        slideWidth = slideRect.width || slideWidth;
        slideHeight = slideRect.height || slideHeight;
      }

      // whiteboard 的尺寸应该与 slide 容器在缩放后的实际像素尺寸一致
      // slide 容器使用了 transform scale，所以实际显示的像素尺寸是初始尺寸 * scale
      const targetWidth = slideWidth;
      const targetHeight = slideHeight;

      // 设置 whiteboard 的尺寸，让它与 slide 的视觉尺寸一致
      this.whiteboardContainer.style.width = `${targetWidth}px`;
      this.whiteboardContainer.style.height = `${targetHeight}px`;

      // 因为 whiteboard 容器使用 width/height 缩放，而 slide 使用 transform scale
      // 我们需要调整 whiteboard 的位移来保持与 slide 的视觉重叠
      // slide 的实际视觉位置：translate(slideTranslateX/scale, slideTranslateY/scale)
      const slideVisualX = this.slideTranslateX / this.scale;
      const slideVisualY = this.slideTranslateY / this.scale;

      // whiteboard 直接使用位移，不需要缩放补偿
      this.whiteboardContainer.style.transform = `translate(${slideVisualX}px, ${slideVisualY}px)`;
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

  public setWhiteboardView(whiteboardView: any): void {
    this.whiteboardView = whiteboardView;
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
    this.isMoveDragging = false;
    this.isWheelDragging = false;
    this.isCommandOrCtrlPressed = false;
    this.isMPressed = false;

    // 清理超时
    if (this.scaleTimeout) {
      clearTimeout(this.scaleTimeout);
      this.scaleTimeout = 0;
    }

    // 重置两个容器
    this.updateContainers();
  }

  private handleMouseDown(e: MouseEvent): void {
    // 检查是否按下了 cmd/ctrl + m 键（任何缩放级别都可以移动）
    if (this.isCommandOrCtrlPressed && this.isMPressed) {
      e.preventDefault();
      this.isDragging = true;
      this.dragStartX = e.clientX - this.slideTranslateX;
      this.dragStartY = e.clientY - this.slideTranslateY;
      this.container.style.cursor = 'grabbing';
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.isDragging && this.isCommandOrCtrlPressed && this.isMPressed) {
      e.preventDefault();

      this.slideTranslateX = e.clientX - this.dragStartX;
      this.slideTranslateY = e.clientY - this.dragStartY;
      this.whiteboardTranslateX = this.slideTranslateX;
      this.whiteboardTranslateY = this.slideTranslateY;

      this.updateContainers();
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (this.isDragging && this.isCommandOrCtrlPressed && this.isMPressed) {
      this.isDragging = false;
      this.container.style.cursor = 'grab';
    }
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
    this.parent.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('keyup', this.handleKeyup);
    this.container.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
  }

}
