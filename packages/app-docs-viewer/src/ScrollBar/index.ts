import { SideEffectManager } from "side-effect-manager";
import { preventEvent, flattenEvent, clamp } from "../utils/helpers";

const SCROLLBAR_DEFAULT_MIN_HEIGHT = 30;

export interface ScrollBarConfig {
  pagesScrollTop?: number;
  containerWidth: number;
  containerHeight: number;
  pagesWidth: number;
  pagesHeight: number;
  readonly: boolean;
  scrollbarMinHeight?: number;
  wrapClassName: (className: string) => string;
  onDragScroll?: (pageScrollTop: number) => void;
}

export class ScrollBar {
  private sideEffect = new SideEffectManager();

  containerWidth: number;
  containerHeight: number;
  readonly pagesWidth: number;
  readonly pagesHeight: number;
  readonly scrollbarMinHeight: number;
  readonly: boolean;
  wrapClassName: (className: string) => string;
  onDragScroll?: (pageScrollTop: number) => void;

  scale: number;
  pagesScrollTop: number;
  scrollbarHeight: number;

  readonly $scrollbar: HTMLButtonElement;

  constructor(config: ScrollBarConfig) {
    this.pagesScrollTop = config.pagesScrollTop || 0;
    this.containerWidth = config.containerWidth || 1;
    this.containerHeight = config.containerHeight || 1;
    this.pagesWidth = config.pagesWidth || 1;
    this.pagesHeight = config.pagesHeight || 1;
    this.scale = this._calcScale();
    this.scrollbarMinHeight = config.scrollbarMinHeight || SCROLLBAR_DEFAULT_MIN_HEIGHT;
    this.scrollbarHeight = this._calcScrollbarHeight(); // after scale is set
    this.readonly = config.readonly;
    this.wrapClassName = config.wrapClassName;
    this.onDragScroll = config.onDragScroll;

    this.$scrollbar = this.renderScrollbar();
  }

  mount($parent: HTMLElement): void {
    $parent.appendChild(this.$scrollbar);
    this.pagesScrollTo(this.pagesScrollTop, true);
  }

  unmount(): void {
    this.$scrollbar.remove();
  }

  setReadonly(readonly: boolean): void {
    this.readonly = readonly;
  }

  setContainerSize(width: number, height: number): void {
    if (width > 0 && height > 0) {
      if (width !== this.containerWidth || height !== this.containerHeight) {
        this.containerWidth = width;
        this.containerHeight = height;

        this.scale = this._calcScale();
        this._updateScrollbarHeight();

        if (this.$scrollbar.parentElement) {
          this.pagesScrollTo(this.pagesScrollTop, true);
        }
      }
    }
  }

  pagesScrollTo(pagesScrollTop: number, force?: boolean): void {
    pagesScrollTop = clamp(pagesScrollTop, 0, this.pagesHeight - this.containerHeight / this.scale);

    if (force || Math.abs(pagesScrollTop - this.pagesScrollTop) >= 0.001) {
      this.pagesScrollTop = pagesScrollTop;

      const elScrollTop = this.pagesScrollTop * this.scale;
      const elPagesHeight = this.pagesHeight * this.scale;
      const translateY =
        (elScrollTop / (elPagesHeight - this.containerHeight)) *
        (this.containerHeight - this.scrollbarHeight);

      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(() => {
          this.$scrollbar.style.transform = `translateY(${translateY}px)`;
        });
      } else {
        this.$scrollbar.style.transform = `translateY(${translateY}px)`;
      }
    }
  }

  destroy() {
    this.unmount();
    this.onDragScroll = void 0;
    this.sideEffect.flushAll();
  }

  private renderScrollbar(): HTMLButtonElement {
    const $scrollbar = document.createElement("button");
    $scrollbar.className = this.wrapClassName("scrollbar");
    $scrollbar.style.minHeight = `${this.scrollbarMinHeight}px`;
    $scrollbar.style.height = `${this.scrollbarHeight}px`;

    const trackStart = (ev: MouseEvent | TouchEvent): void => {
      if (this.readonly) {
        return;
      }

      if ((ev as MouseEvent).button != null && (ev as MouseEvent).button !== 0) {
        // Not left mouse
        return;
      }

      preventEvent(ev);

      const draggingClassName = this.wrapClassName("scrollbar-dragging");

      $scrollbar.classList.toggle(draggingClassName, true);

      const startTop = this.pagesScrollTop;

      const { clientY: startY } = flattenEvent(ev);

      const tracking = (ev: MouseEvent | TouchEvent): void => {
        if (this.readonly) {
          return;
        }

        const { clientY } = flattenEvent(ev);
        const offsetY = (clientY - startY) / this.scale;
        if (Math.abs(offsetY) > 0 && this.onDragScroll) {
          this.onDragScroll(
            startTop + offsetY * ((this.pagesHeight * this.scale) / this.containerHeight)
          );
        }
      };

      const trackEnd = (): void => {
        $scrollbar.classList.toggle(draggingClassName, false);
        window.removeEventListener("mousemove", tracking, true);
        window.removeEventListener("touchmove", tracking, true);
        window.removeEventListener("mouseup", trackEnd, true);
        window.removeEventListener("touchend", trackEnd, true);
        window.removeEventListener("touchcancel", trackEnd, true);
      };

      window.addEventListener("mousemove", tracking, true);
      window.addEventListener("touchmove", tracking, true);
      window.addEventListener("mouseup", trackEnd, true);
      window.addEventListener("touchend", trackEnd, true);
      window.addEventListener("touchcancel", trackEnd, true);
    };

    this.sideEffect.addEventListener($scrollbar, "mousedown", trackStart);
    this.sideEffect.addEventListener($scrollbar, "touchstart", trackStart);

    return $scrollbar;
  }

  private _calcScale(): number {
    return this.containerWidth / this.pagesWidth || 1;
  }

  private _calcScrollbarHeight() {
    return clamp(
      (this.containerHeight / (this.pagesHeight * this.scale)) * this.containerHeight,
      this.scrollbarMinHeight,
      this.containerHeight
    );
  }

  private _updateScrollbarHeight(): void {
    const newHeight = this._calcScrollbarHeight();
    if (Math.abs(newHeight - this.scrollbarHeight) > 0.001) {
      this.scrollbarHeight = newHeight;
      this.$scrollbar.style.height = `${newHeight}px`;
    }
  }
}
