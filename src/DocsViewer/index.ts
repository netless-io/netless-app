import { AnimationMode, ReadonlyTeleBox, View } from "@netless/window-manager";
import LazyLoad from "vanilla-lazyload";
import debounceFn from "debounce-fn";
import { SideEffectManager } from "../utils/SideEffectManager";
import { Viewer, ViewerPage } from "../Viewer";

export interface DocsViewerConfig {
    whiteboardView: View;
    isWritable: boolean;
    box: ReadonlyTeleBox;
    pages: ViewerPage[];
    pagesSize: { width: number; height: number };
    /** Scroll Top of the original page */
    pageScrollTop?: number;
    onUserScroll?: (pageScrollTop: number) => void;
}

export class DocsViewer {
    public constructor({
        whiteboardView,
        isWritable,
        box,
        pages,
        pagesSize,
        pageScrollTop = 0,
        onUserScroll,
    }: DocsViewerConfig) {
        this.whiteboardView = whiteboardView;
        this.isWritable = isWritable;
        this.box = box;
        this.pages = pages;
        this.pageScrollTop = pageScrollTop;
        this.pagesSize = pagesSize;
        this.onUserScroll = onUserScroll;

        this.viewer = new Viewer({
            isWritable,
            box,
            pages,
            onNewPageIndex: this.onNewPageIndex,
        });

        this.render();
    }

    protected isWritable: boolean;
    protected pages: ViewerPage[];
    protected box: ReadonlyTeleBox;
    protected whiteboardView: View;

    public pageScrollTop: number;
    public pagesSize: { width: number; height: number };
    public onUserScroll?: (pageScrollTop: number) => void;

    public viewer: Viewer;

    public $pages!: HTMLElement;
    public $whiteboardView!: HTMLDivElement;

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

    public setWritable(isWritable: boolean): void {
        if (this.isWritable !== isWritable) {
            this.isWritable = isWritable;

            this.viewer.setWritable(isWritable);
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
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();
                    if (this.isWritable) {
                        const scrollTop = Math.min(
                            this.pagesSize.height,
                            Math.max(0, this.pageScrollTop + ev.deltaY)
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
                        ev.preventDefault();
                        ev.stopPropagation();
                        ev.stopImmediatePropagation();
                        if (this.isWritable) {
                            // @TODO
                        }
                    }
                },
                { passive: false, capture: true }
            );
        }
        return this.$whiteboardView;
    }

    protected scrollTopPageToEl(pageScrollTop: number): number | null {
        const height = this.$pages.scrollHeight;
        if (height > 0) {
            return pageScrollTop * (height / this.pagesSize.height);
        }
        return null;
    }

    protected scrollTopElToPage(elScrollTop: number): number | null {
        const height = this.$pages.scrollHeight;
        if (height > 0) {
            return elScrollTop * (this.pagesSize.height / height);
        }
        return null;
    }

    /** Scroll base on DOM rect */
    protected elScrollTo(elScrollTop: number): void {
        this.$pages.scrollTo({
            top: elScrollTop,
        });
    }

    /** Scroll base on docs size */
    protected pageScrollTo(pageScrollTop: number): void {
        const elScrollTop = this.scrollTopPageToEl(pageScrollTop);
        if (elScrollTop !== null) {
            this.elScrollTo(elScrollTop);
        }
    }

    protected scrollToPage(index: number): void {
        if (this.isWritable && this.$pages && !Number.isNaN(index)) {
            index = Math.max(0, Math.min(this.pages.length - 1, index));
            const $page = this.$pages.querySelector<HTMLElement>(
                "." + this.wrapClassName(`page-${index}`)
            );
            if ($page) {
                const elOffsetTop = $page.offsetTop;
                this.elScrollTo(elOffsetTop);
                if (this.onUserScroll) {
                    const pageOffsetTop = this.scrollTopElToPage(elOffsetTop);
                    if (pageOffsetTop !== null) {
                        this.onUserScroll(pageOffsetTop);
                    }
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

        if (this.$pages) {
            this.sideEffect.addEventListener(this.$pages, "scroll", () => {
                const elScrollTop = this.$pages.scrollTop;
                const pageScrollTop = this.scrollTopElToPage(elScrollTop);
                if (pageScrollTop !== null) {
                    this.pageScrollTop = pageScrollTop;
                }

                const cameraScale = this.whiteboardView.camera.scale;
                if (cameraScale > 0) {
                    this.whiteboardView.moveCamera({
                        centerY: elScrollTop / cameraScale,
                        animationMode: "immediately" as AnimationMode,
                    });
                }

                updatePageIndex();
            });
        }
    }

    protected setupWhiteboardCamera(): void {
        const fixCamera = this.debounce(() => {
            if (this.$pages) {
                this.elScrollTo(this.$pages.scrollTop);
            }
        }, 100);

        this.sideEffect.add(() => {
            const handleSizeUpdate = (): void => {
                if (this.pages.length > 0) {
                    const { width, height } =
                        this.viewer.$content.getBoundingClientRect();
                    if (width > 0 && height > 0) {
                        // @FIXME calc originY on size changes
                        this.whiteboardView.moveCameraToContain({
                            originX: 0,
                            originY: this.$pages
                                ? this.$pages.scrollTop *
                                  (this.pages[0].width / width)
                                : 0,
                            width: this.pages[0].width,
                            height: (this.pages[0].width / width) * height,
                            animationMode: "immediately" as AnimationMode,
                        });
                        fixCamera();
                    }
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

    protected debounce(
        fn: () => void,
        wait: number,
        disposerID?: string
    ): () => void {
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
}
