import type { AnimationMode, ReadonlyTeleBox } from "@netless/window-manager";
import type { View, Size } from "white-web-sdk";
import LazyLoad from "vanilla-lazyload";
import debounceFn, { DebouncedFunction } from "debounce-fn";
import { SideEffectManager } from "../utils/SideEffectManager";
import { DocsViewer, DocsViewerPage } from "../DocsViewer";
import { clamp, flattenEvent, preventEvent } from "../utils/helpers";

const SCROLLBAR_MIN_HEIGHT = 30;

export interface StaticDocsViewerConfig {
    whiteboardView: View;
    readonly: boolean;
    box: ReadonlyTeleBox;
    pages: DocsViewerPage[];
    pagesSize: { width: number; height: number };
    /** Scroll Top of the original page */
    pageScrollTop?: number;
    onUserScroll?: (pageScrollTop: number) => void;
}

export class StaticDocsViewer {
    public constructor({
        whiteboardView,
        readonly,
        box,
        pages,
        pagesSize,
        pageScrollTop = 0,
        onUserScroll,
    }: StaticDocsViewerConfig) {
        this.whiteboardView = whiteboardView;
        this.readonly = readonly;
        this.box = box;
        this.pages = pages;
        this.pageScrollTop = pageScrollTop;
        this.pagesSize = pagesSize;
        this.onUserScroll = onUserScroll;

        this.viewer = new DocsViewer({
            readonly,
            box,
            pages,
            onNewPageIndex: this.onNewPageIndex,
        });

        this.render();
    }

    protected readonly: boolean;
    protected pages: DocsViewerPage[];
    protected box: ReadonlyTeleBox;
    protected whiteboardView: View;

    public pageScrollTop: number;
    public pagesSize: { width: number; height: number };
    public onUserScroll?: (pageScrollTop: number) => void;

    public viewer: DocsViewer;

    public $pages!: HTMLElement;
    public $whiteboardView!: HTMLDivElement;
    public $scrollbar!: HTMLElement;

    public mount(): this {
        this.viewer.mount();

        this.sideEffect.add(() => {
            const contentLazyLoad = new LazyLoad({
                container: this.$pages,
                elements_selector: `.${this.wrapClassName("page")}`,
            });
            return () => contentLazyLoad.destroy();
        }, "page-lazyload");

        this.setupWhiteboardCamera();

        if (this.pageScrollTop !== 0) {
            this.pageScrollTo(this.pageScrollTop);
        }

        // add event listener after scrollTop is set
        this.setupScrollTopEvent();

        return this;
    }

    public unmount(): this {
        this.viewer.unmount();
        return this;
    }

    public setReadonly(readonly: boolean): void {
        if (this.readonly !== readonly) {
            this.readonly = readonly;
            this.viewer.setReadonly(readonly);
        }
    }

    public destroy(): void {
        this.sideEffect.flush();
        this.onUserScroll = void 0;
        this.unmount();
        this.viewer.destroy();
    }

    /** Sync scrollTop from writable user */
    public syncPageScrollTop(pageScrollTop: number): void {
        if (
            pageScrollTop >= 0 &&
            Math.abs(this.pageScrollTop - pageScrollTop) > 10
        ) {
            this.pageScrollTo(pageScrollTop);
        }
    }

    public render(): void {
        this.viewer.$content.appendChild(this.renderPages());
        this.viewer.$content.appendChild(this.renderWhiteboardView());
        this.viewer.$content.appendChild(this.renderScrollbar());
        if (this.box.$titleBar) {
            this.box.$titleBar.style.height = `${(26 / 320) * 100}%`;
        }
        if (this.box.$footer) {
            this.box.$footer.style.height = `${(26 / 320) * 100}%`;
        }
    }

    protected renderPages(): HTMLElement {
        if (!this.$pages) {
            const $pages = document.createElement("div");
            $pages.className = this.wrapClassName("pages");
            this.$pages = $pages;

            const pageClassName = this.wrapClassName("page");
            this.pages.forEach((page, i) => {
                const $img = document.createElement("img");
                $img.className =
                    pageClassName + " " + this.wrapClassName(`page-${i}`);
                $img.draggable = false;
                $img.width = page.width;
                $img.height = page.height;
                $img.dataset.src = page.src;
                $img.dataset.pageIndex = String(i);

                $pages.appendChild($img);
            });
        }
        return this.$pages;
    }

    protected renderWhiteboardView(): HTMLDivElement {
        if (!this.$whiteboardView) {
            this.$whiteboardView = document.createElement("div");
            this.$whiteboardView.className = this.wrapClassName("wb-view");
            this.whiteboardView.divElement = this.$whiteboardView;
            this.sideEffect.addEventListener(
                this.$whiteboardView,
                "wheel",
                (ev) => {
                    preventEvent(ev);
                    if (!this.readonly) {
                        const scrollTop = clamp(
                            this.pageScrollTop + ev.deltaY,
                            0,
                            this.pagesSize.height
                        );
                        this.pageScrollTo(scrollTop);
                        if (this.onUserScroll) {
                            this.onUserScroll(scrollTop);
                        }
                    }
                },
                { passive: false, capture: true }
            );
            this.sideEffect.addEventListener(
                this.$whiteboardView,
                "touchstart",
                (ev) => {
                    if (ev.touches.length > 1) {
                        preventEvent(ev);
                        if (this.readonly) {
                            return;
                        }
                        this.handleSwipeScroll(ev);
                    }
                },
                { passive: false, capture: true }
            );
        }
        return this.$whiteboardView;
    }

    protected renderScrollbar(): HTMLElement {
        if (!this.$scrollbar) {
            const $scrollbar = document.createElement("button");
            this.$scrollbar = $scrollbar;
            $scrollbar.className = this.wrapClassName("scrollbar");
            $scrollbar.style.minHeight = `${SCROLLBAR_MIN_HEIGHT}px`;

            const trackStart = (ev: MouseEvent | TouchEvent): void => {
                if (this.readonly) {
                    return;
                }

                preventEvent(ev);

                this.setIsDragScrollbar(true);

                const startTop = this.scrollTopPageToEl(this.pageScrollTop);
                const elScrollHeight =
                    (this.whiteboardView.size.width / this.pagesSize.width) *
                    this.pagesSize.height;
                const { clientY: startY } = flattenEvent(ev);

                const tracking = (ev: MouseEvent | TouchEvent): void => {
                    const { clientY } = flattenEvent(ev);
                    const { height: wbHeight } = this.whiteboardView.size;
                    this.elScrollTo(
                        clamp(
                            startTop +
                                (clientY - startY) *
                                    (elScrollHeight / wbHeight),
                            0,
                            elScrollHeight -
                                this.scrollbarHeight *
                                    (elScrollHeight / wbHeight)
                        )
                    );
                };

                const trackEnd = (): void => {
                    this.setIsDragScrollbar(false);
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
            this.sideEffect.addEventListener(
                $scrollbar,
                "mousedown",
                trackStart
            );
            this.sideEffect.addEventListener(
                $scrollbar,
                "touchstart",
                trackStart
            );
        }
        return this.$scrollbar;
    }

    protected scrollTopPageToEl(pageScrollTop: number): number {
        return (
            pageScrollTop *
            (this.whiteboardView.size.width / this.pagesSize.width)
        );
    }

    protected scrollTopElToPage(elScrollTop: number): number {
        return (
            elScrollTop /
            (this.whiteboardView.size.width / this.pagesSize.width)
        );
    }

    /** Scroll base on DOM rect */
    protected elScrollTo(elScrollTop: number): void {
        this.$pages.scrollTo({
            top: elScrollTop,
        });
    }

    /** Scroll base on docs size */
    protected pageScrollTo(pageScrollTop: number): void {
        this.elScrollTo(this.scrollTopPageToEl(pageScrollTop));
    }

    protected scrollToPage(index: number): void {
        if (!this.readonly && this.$pages && !Number.isNaN(index)) {
            index = clamp(index, 0, this.pages.length - 1);
            const $page = this.$pages.querySelector<HTMLElement>(
                "." + this.wrapClassName(`page-${index}`)
            );
            if ($page) {
                const elOffsetTop = $page.offsetTop;
                this.elScrollTo(elOffsetTop);
                if (this.onUserScroll) {
                    this.onUserScroll(this.scrollTopElToPage(elOffsetTop));
                }
            }
        }
    }

    protected setupScrollTopEvent(): void {
        const updatePageIndex = this.debounce(
            () => {
                if (this.pages.length > 0 && this.$pages) {
                    const pagesWidth =
                        this.$pages.getBoundingClientRect().width;
                    if (pagesWidth > 0) {
                        let pageTop = 0;
                        for (let i = 0; i < this.pages.length; i += 1) {
                            pageTop += this.pages[i].height;
                            if (this.pageScrollTop <= pageTop) {
                                this.viewer.setPageIndex(i);
                                return;
                            }
                        }
                        this.viewer.setPageIndex(this.pages.length - 1);
                    }
                }
            },
            100,
            "debounce-updatePageIndex"
        );

        this.sideEffect.addEventListener(this.$pages, "scroll", () => {
            const elScrollTop = this.$pages.scrollTop;
            const pageScrollTop = this.scrollTopElToPage(elScrollTop);
            this.pageScrollTop = pageScrollTop;

            const { width: wbWidth, height: wbHeight } =
                this.whiteboardView.size;
            const { width: pageWidth, height: pageHeight } = this.pagesSize;

            this.whiteboardView.moveCamera({
                centerY: this.scrollTopElToPage(elScrollTop + wbHeight / 2),
                animationMode: "immediately" as AnimationMode,
            });

            this.setScrollbarHeight(
                wbHeight / ((wbWidth / pageWidth) * pageHeight)
            );
            this.$scrollbar.style.transform = `translateY(${
                (pageScrollTop / pageHeight) * wbHeight
            }px)`;

            updatePageIndex();
        });
    }

    protected setupWhiteboardCamera(): void {
        this.sideEffect.add(() => {
            const handleSizeUpdate = ({ width, height }: Size): void => {
                if (width > 0 && height > 0) {
                    const pageWidth = this.pagesSize.width;
                    const ratio = pageWidth / width;
                    this.whiteboardView.moveCameraToContain({
                        originX: 0,
                        originY: this.$pages.scrollTop * ratio,
                        width: pageWidth,
                        height: height * ratio,
                        animationMode: "immediately" as AnimationMode,
                    });
                }
            };
            this.whiteboardView.callbacks.on("onSizeUpdated", handleSizeUpdate);
            return () => {
                this.whiteboardView.callbacks.off(
                    "onSizeUpdated",
                    handleSizeUpdate
                );
            };
        }, "whiteboard-size-update");
    }

    protected debounce<ArgumentsType extends unknown[], ReturnType>(
        fn: (...args: ArgumentsType) => ReturnType,
        wait: number,
        disposerID?: string
    ): DebouncedFunction<ArgumentsType, ReturnType | undefined> {
        const dFn = debounceFn(fn, { wait });
        this.sideEffect.addDisposer(() => dFn.cancel(), disposerID);
        return dFn;
    }

    protected wrapClassName(className: string): string {
        return "netless-app-docs-viewer-static-" + className;
    }

    protected onNewPageIndex = (index: number): void => {
        this.scrollToPage(index);
    };

    protected sideEffect = new SideEffectManager();

    protected isDragScrollbar = false;

    protected setIsDragScrollbar(isDragScrollbar: boolean): void {
        if (this.isDragScrollbar !== isDragScrollbar) {
            this.isDragScrollbar = isDragScrollbar;
            this.$scrollbar.classList.toggle(
                this.wrapClassName("scrollbar-dragging"),
                isDragScrollbar
            );
        }
    }

    protected scrollbarHeight = SCROLLBAR_MIN_HEIGHT;

    protected setScrollbarHeight(elScrollbarHeight: number): void {
        elScrollbarHeight = clamp(
            elScrollbarHeight,
            SCROLLBAR_MIN_HEIGHT,
            this.whiteboardView.size.height
        );
        if (this.scrollbarHeight !== elScrollbarHeight) {
            this.scrollbarHeight = elScrollbarHeight;
            this.$scrollbar.style.height = `${elScrollbarHeight}px`;
        }
    }

    protected handleSwipeScroll(ev: TouchEvent): void {
        const startTop = this.scrollTopPageToEl(this.pageScrollTop);
        const elScrollHeight =
            (this.whiteboardView.size.width / this.pagesSize.width) *
            this.pagesSize.height;
        let { clientY: startY } = ev.touches[0];

        const tracking = (ev: TouchEvent): void => {
            const { clientY } = ev.touches[0];
            this.elScrollTo(
                clamp(startTop + (startY - clientY), 0, elScrollHeight)
            );
        };

        const trackEnd = (ev: TouchEvent): void => {
            ({ clientY: startY } = ev.touches[0]);
            this.setIsDragScrollbar(false);
            window.removeEventListener("touchmove", tracking, true);
            window.removeEventListener("touchend", trackEnd, true);
            window.removeEventListener("touchcancel", trackEnd, true);
        };

        window.addEventListener("touchmove", tracking, true);
        window.addEventListener("touchend", trackEnd, true);
        window.addEventListener("touchcancel", trackEnd, true);
    }
}
