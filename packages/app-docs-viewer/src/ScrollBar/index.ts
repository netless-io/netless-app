import type { TeleBoxRect } from "@netless/window-manager";
import { SideEffectManager } from "side-effect-manager";
import type { ReadonlyVal } from "value-enhancer";
import { combine, Val } from "value-enhancer";
import { preventEvent, flattenEvent, clamp } from "../utils/helpers";

const SCROLLBAR_DEFAULT_MIN_HEIGHT = 30;

export interface ScrollBarConfig {
  pagesScrollTop$: ReadonlyVal<number>;
  containerRect$: ReadonlyVal<TeleBoxRect>;
  stageRect$: ReadonlyVal<TeleBoxRect>;
  pagesSize$: ReadonlyVal<{ width: number; height: number }>;
  readonly$: ReadonlyVal<boolean>;
  scrollbarMinHeight?: number;
  wrapClassName: (className: string) => string;
  onDragScroll?: (pageScrollTop: number) => void;
}

export class ScrollBar {
  private sideEffect = new SideEffectManager();

  readonly scrollbarMinHeight: number;
  readonly readonly$: ScrollBarConfig["readonly$"];
  wrapClassName: (className: string) => string;
  onDragScroll?: (pageScrollTop: number) => void;

  readonly $scrollbar: HTMLButtonElement;

  readonly pagesScrollTop$: ScrollBarConfig["pagesScrollTop$"];
  readonly containerRect$: ScrollBarConfig["containerRect$"];
  readonly stageRect$: ScrollBarConfig["stageRect$"];
  readonly pagesSize$: ScrollBarConfig["pagesSize$"];

  readonly scrolling$ = new Val(false);
  readonly scrollbarHeight$: ReadonlyVal<number>;
  readonly scrollTop$: ReadonlyVal<number>;

  constructor({
    pagesScrollTop$,
    containerRect$,
    stageRect$,
    pagesSize$,
    readonly$,
    scrollbarMinHeight = SCROLLBAR_DEFAULT_MIN_HEIGHT,
    wrapClassName,
    onDragScroll,
  }: ScrollBarConfig) {
    this.pagesScrollTop$ = pagesScrollTop$;
    this.containerRect$ = containerRect$;
    this.stageRect$ = stageRect$;
    this.pagesSize$ = pagesSize$;
    this.scrollbarMinHeight = scrollbarMinHeight;
    this.readonly$ = readonly$;
    this.wrapClassName = wrapClassName;
    this.onDragScroll = onDragScroll;

    this.scrollbarHeight$ = combine(
      [containerRect$, stageRect$, pagesSize$],
      ([containerRect, stageRect, pagesSize]) =>
        clamp(
          (stageRect.height / ((stageRect.width / pagesSize.width) * pagesSize.height)) *
            containerRect.height,
          scrollbarMinHeight,
          containerRect.height
        )
    );

    this.scrollTop$ = combine(
      [containerRect$, stageRect$, pagesSize$, this.scrollbarHeight$, this.pagesScrollTop$],
      ([containerRect, stageRect, pagesSize, scrollbarHeight, pagesScrollTop]) =>
        clamp(
          (pagesScrollTop /
            (pagesSize.height - (pagesSize.width / stageRect.width) * stageRect.height)) *
            (containerRect.height - scrollbarHeight),
          0,
          containerRect.height - scrollbarHeight
        )
    );

    this.$scrollbar = this.renderScrollbar();
  }

  mount($parent: HTMLElement): void {
    $parent.appendChild(this.$scrollbar);
  }

  destroy() {
    this.$scrollbar.remove();
    this.onDragScroll = void 0;
    this.sideEffect.flushAll();
  }

  private renderScrollbar(): HTMLButtonElement {
    const $scrollbar = document.createElement("button");
    $scrollbar.className = this.wrapClassName("scrollbar");
    $scrollbar.style.minHeight = `${this.scrollbarMinHeight}px`;

    this.sideEffect.addDisposer([
      this.scrollbarHeight$.subscribe(scrollbarHeight => {
        $scrollbar.style.height = `${scrollbarHeight}px`;
      }),
      this.scrollTop$.subscribe(scrollTop => {
        this.scrolling$.setValue(true);
        this.sideEffect.setTimeout(() => this.scrolling$.setValue(false), 100, "reset-scrolling");
        const update = () => ($scrollbar.style.transform = `translateY(${scrollTop}px)`);
        window.requestAnimationFrame ? window.requestAnimationFrame(update) : update();
      }),
      this.scrolling$.subscribe(scrolling => {
        $scrollbar.classList.toggle(this.wrapClassName("scrolling"), scrolling);
      }),
    ]);

    const trackStart = (ev: PointerEvent): void => {
      if (!ev.isPrimary || this.readonly$.value) {
        return;
      }

      if (ev.button != null && ev.button !== 0) {
        // Not left mouse
        return;
      }

      preventEvent(ev);

      const draggingClassName = this.wrapClassName("scrollbar-dragging");

      $scrollbar.classList.toggle(draggingClassName, true);

      const startTop = this.pagesScrollTop$.value;

      const { clientY: startY } = flattenEvent(ev);

      const tracking = (ev: PointerEvent): void => {
        if (!ev.isPrimary || this.readonly$.value) {
          return;
        }

        const { clientY } = flattenEvent(ev);
        const offsetY = clientY - startY;
        if (Math.abs(offsetY) > 0 && this.onDragScroll) {
          this.onDragScroll(
            startTop + (offsetY / this.containerRect$.value.height) * this.pagesSize$.value.height
          );
        }
      };

      const trackEnd = (ev: PointerEvent): void => {
        if (!ev.isPrimary) {
          return;
        }
        $scrollbar.classList.toggle(draggingClassName, false);
        window.removeEventListener("pointermove", tracking, true);
        window.removeEventListener("pointerup", trackEnd, true);
        window.removeEventListener("pointercancel", trackEnd, true);
      };

      window.addEventListener("pointermove", tracking, true);
      window.addEventListener("pointerup", trackEnd, true);
      window.addEventListener("pointercancel", trackEnd, true);
    };

    this.sideEffect.addEventListener($scrollbar, "pointerdown", trackStart);

    return $scrollbar;
  }
}
