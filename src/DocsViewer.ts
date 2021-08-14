// @TODO https://github.com/vitejs/vite/pull/4570
// @ts-ignore
import styles from "./style.scss?inline";
import sidebarSVG from "./icons/sidebar.svg";
import arrowLeftSVG from "./icons/arrow-left.svg";
import arrowRightSVG from "./icons/arrow-right.svg";

import { AnimationMode, ReadonlyTeleBox, View } from "@netless/window-manager";
import LazyLoad from "vanilla-lazyload";
import debounceFn from "debounce-fn";

export interface DocsViewerPage {
    src: string;
    height: number;
    width: number;
    thumbnail?: string;
}

export interface DocsViewerConfig {
    whiteboardView: View;
    isWritable: boolean;
    box: ReadonlyTeleBox;
    pages: DocsViewerPage[];
    scrollTop?: number;
    onUserScroll?: (scrollTop: number) => void;
}

export class DocsViewer {
    public constructor({
        whiteboardView,
        isWritable,
        box,
        pages,
        scrollTop = 0,
        onUserScroll,
    }: DocsViewerConfig) {
        this.whiteboardView = whiteboardView;
        this.isWritable = isWritable;
        this.box = box;
        this.pages = pages;
        this.scrollTop = scrollTop;
        this.onUserScroll = onUserScroll;
    }

    public scrollTop: number;

    public onUserScroll?: (scrollTop: number) => void;

    public $content: HTMLElement | undefined;
    public $pages: HTMLElement | undefined;
    public $preview: HTMLElement | undefined;
    public $previewMask: HTMLElement | undefined;
    public $footer: HTMLElement | undefined;
    public $pageNumberInput: HTMLInputElement | undefined;
    public $whiteboardView: HTMLDivElement | undefined;

    public mount(): this {
        if (this.pages.length <= 0) {
            // @TODO render empty page
            return this;
        }

        this.box.mountContent(this.renderContent());
        this.box.mountFooter(this.renderFooter());

        const contentLazyLoad = new LazyLoad({
            container: this.$pages,
            elements_selector: `.${this.wrapClassName("page")}`,
        });
        this.sideEffectDisposers.push(() => contentLazyLoad.destroy());

        const previewLazyLoad = new LazyLoad({
            container: this.$preview,
            elements_selector: `.${this.wrapClassName("preview-page>img")}`,
        });
        this.sideEffectDisposers.push(() => previewLazyLoad.destroy());

        this.setupWhiteboardCamera();

        if (this.scrollTop !== 0) {
            this.scrollTo(this.scrollTop);
        }

        // add event listener after scrollTop is set
        this.setupScrollTopEvent();

        return this;
    }

    public unmount(): this {
        if (this.$content) {
            this.$content.remove();
        }
        return this;
    }

    public setWritable(isWritable: boolean): void {
        if (this.isWritable !== isWritable) {
            this.isWritable = isWritable;

            if (this.$content) {
                this.$content.classList.toggle(
                    this.wrapClassName("readonly"),
                    !isWritable
                );
            }
        }
    }

    public destroy(): void {
        this.sideEffectDisposers.forEach((fn) => fn());
        this.sideEffectDisposers.length = 0;
        this.onUserScroll = void 0;
        this.unmount();
    }

    /** Sync scrollTop from writable user */
    public syncScrollTop(scrollTop: number): void {
        if (scrollTop >= 0 && Math.abs(this.scrollTop - scrollTop) > 10) {
            if (this.$pages) {
                this.scrollTo(scrollTop);
            }
        }
    }

    protected setPageIndex(pageIndex: number): void {
        if (!Number.isNaN(pageIndex)) {
            this.pageIndex = pageIndex;
            if (this.$pageNumberInput) {
                this.$pageNumberInput.value = String(pageIndex + 1);
            }
        }
    }

    protected renderContent(): HTMLElement {
        if (!this.$content) {
            const $content = document.createElement("div");
            $content.className = this.wrapClassName("content");
            this.$content = $content;

            if (!this.isWritable) {
                $content.classList.add(this.wrapClassName("readonly"));
            }

            const $style = document.createElement("style");
            $style.textContent = styles;
            $content.appendChild($style);

            const $pages = document.createElement("div");
            $pages.className =
                this.wrapClassName("pages") + " tele-fancy-scrollbar";
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

            $content.appendChild(this.renderWhiteboardView());

            $content.appendChild($pages);
            $content.appendChild(this.renderPreviewMask());
            $content.appendChild(this.renderPreview());
        }
        return this.$content;
    }

    protected renderWhiteboardView(): HTMLElement {
        if (!this.$whiteboardView) {
            this.$whiteboardView = document.createElement("div");
            this.$whiteboardView.className = this.wrapClassName("wb-view");
            this.whiteboardView.divElement = this.$whiteboardView;
            this.addEventListener(
                this.$whiteboardView,
                "wheel",
                (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();
                    if (this.isWritable) {
                        const scrollTop = Math.max(
                            0,
                            this.scrollTop + ev.deltaY
                        );
                        this.scrollTo(scrollTop);
                        if (this.onUserScroll) {
                            this.onUserScroll(scrollTop);
                        }
                    }
                },
                { passive: false, capture: true }
            );
            this.addEventListener(
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
            this.addEventListener(
                this.$whiteboardView,
                "touchmove",
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
            this.addEventListener(
                this.$whiteboardView,
                "touchend",
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

    protected renderPreview(): HTMLElement {
        if (!this.$preview) {
            const $preview = document.createElement("div");
            $preview.className =
                this.wrapClassName("preview") + " tele-fancy-scrollbar";
            this.$preview = $preview;

            const pageClassName = this.wrapClassName("preview-page");
            const pageNameClassName = this.wrapClassName("preview-page-name");
            this.pages.forEach((page, i) => {
                const pageIndex = String(i);

                const $page = document.createElement("a");
                $page.className =
                    pageClassName +
                    " " +
                    this.wrapClassName(`preview-page-${i}`);
                $page.setAttribute("href", "#");
                $page.dataset.pageIndex = pageIndex;

                const $name = document.createElement("span");
                $name.className = pageNameClassName;
                $name.textContent = String(i + 1);
                $name.dataset.pageIndex = pageIndex;

                const $img = document.createElement("img");
                $img.width = page.width;
                $img.height = page.height;
                $img.dataset.src = page.thumbnail ?? page.src;
                $img.dataset.pageIndex = pageIndex;

                $page.appendChild($img);
                $page.appendChild($name);
                $preview.appendChild($page);
            });

            this.addEventListener($preview, "click", (ev) => {
                const pageIndex = (ev.target as HTMLElement).dataset?.pageIndex;
                if (pageIndex) {
                    this.scrollToPage(Number(pageIndex));
                }
            });
        }

        return this.$preview;
    }

    protected renderPreviewMask(): HTMLElement {
        if (!this.$previewMask) {
            this.$previewMask = document.createElement("div");
            this.$previewMask.className = this.wrapClassName("preview-mask");
            this.addEventListener(this.$previewMask, "click", (ev) => {
                if (ev.target === this.$previewMask) {
                    this.togglePreview(false);
                }
            });
        }
        return this.$previewMask;
    }

    protected renderFooter(): HTMLElement {
        if (!this.$footer) {
            const $footer = document.createElement("div");
            $footer.className = this.wrapClassName("footer");
            this.$footer = $footer;

            const $btnSidebar = this.renderFooterBtn("btn-sidebar", sidebarSVG);
            this.addEventListener($btnSidebar, "click", () => {
                this.togglePreview();
            });

            const $pageJumps = document.createElement("div");
            $pageJumps.className = this.wrapClassName("page-jumps");

            const $btnPageBack = this.renderFooterBtn(
                "btn-page-back",
                arrowLeftSVG
            );
            this.addEventListener($btnPageBack, "click", () => {
                this.scrollToPage(this.pageIndex - 1);
            });

            const $btnPageNext = this.renderFooterBtn(
                "btn-page-next",
                arrowRightSVG
            );
            this.addEventListener($btnPageNext, "click", () => {
                this.scrollToPage(this.pageIndex + 1);
            });

            const $pageNumber = document.createElement("div");
            $pageNumber.className = this.wrapClassName("page-number");

            const $pageNumberInput = document.createElement("input");
            $pageNumberInput.className =
                this.wrapClassName("page-number-input");
            $pageNumberInput.value = String(this.pageIndex + 1);
            this.$pageNumberInput = $pageNumberInput;
            this.addEventListener($pageNumberInput, "change", () => {
                if ($pageNumberInput.value) {
                    this.scrollToPage(Number($pageNumberInput.value) - 1);
                }
            });

            const $totalPage = document.createElement("span");
            $totalPage.textContent = " / " + this.pages.length;

            $pageJumps.appendChild($btnPageBack);
            $pageJumps.appendChild($btnPageNext);

            $pageNumber.appendChild($pageNumberInput);
            $pageNumber.appendChild($totalPage);

            this.$footer.appendChild($btnSidebar);
            this.$footer.appendChild($pageJumps);
            this.$footer.appendChild($pageNumber);
        }
        return this.$footer;
    }

    protected renderFooterBtn(
        className: string,
        icon: string
    ): HTMLButtonElement {
        const $btn = document.createElement("button");
        $btn.className =
            this.wrapClassName("footer-btn") +
            " " +
            this.wrapClassName(className);

        const $img = document.createElement("img");
        $img.src = icon;

        $btn.appendChild($img);

        return $btn;
    }

    protected addEventListener<K extends keyof HTMLElementEventMap>(
        el: HTMLElement,
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ): this {
        el.addEventListener(type, listener, options);

        this.sideEffectDisposers.push(() => {
            el.removeEventListener(type, listener);
        });

        return this;
    }

    protected togglePreview(isShowPreview?: boolean): void {
        if (!this.$preview || !this.$content) {
            return;
        }
        this.isShowPreview = isShowPreview ?? !this.isShowPreview;
        this.$content.classList.toggle(
            this.wrapClassName("preview-active"),
            this.isShowPreview
        );
        if (this.isShowPreview) {
            const $previewPage = this.$preview.querySelector<HTMLElement>(
                "." + this.wrapClassName(`preview-page-${this.pageIndex}`)
            );
            if ($previewPage) {
                this.$preview.scrollTo({
                    top: $previewPage.offsetTop - 16,
                });
            }
        }
    }

    protected scrollTo(scrollTop: number): void {
        if (this.$pages) {
            this.whiteboardView.moveCamera({
                centerY: scrollTop / this.whiteboardView.camera.scale,
                animationMode: "immediately" as AnimationMode,
            });
            this.$pages.scrollTo({
                top: scrollTop,
            });
        }
    }

    protected scrollToPage(index: number): void {
        if (this.isWritable && this.$pages && !Number.isNaN(index)) {
            index = Math.max(0, Math.min(this.pages.length - 1, index));
            const $page = this.$pages.querySelector<HTMLElement>(
                "." + this.wrapClassName(`page-${index}`)
            );
            if ($page) {
                const offsetTop = $page.offsetTop;
                this.scrollTo($page.offsetTop);
                if (this.onUserScroll) {
                    this.onUserScroll(offsetTop);
                }
            }
        }
    }

    protected setupScrollTopEvent(): void {
        const updatePageIndex = this.debounce(() => {
            if (this.pages.length > 0 && this.$pages) {
                const scrollTop =
                    this.scrollTop *
                    (this.pages[0].width /
                        this.$pages.getBoundingClientRect().width);
                let pageTop = 0;
                for (let i = 0; i < this.pages.length; i += 1) {
                    pageTop += this.pages[i].height;
                    if (scrollTop <= pageTop) {
                        this.setPageIndex(i);
                        return;
                    }
                }
                this.setPageIndex(this.pages.length - 1);
            }
        }, 100);

        if (this.$pages) {
            this.addEventListener(this.$pages, "scroll", () => {
                if (this.$pages) {
                    this.scrollTop = this.$pages.scrollTop;
                }
                updatePageIndex();
            });
        }
    }

    protected setupWhiteboardCamera(): void {
        const fixCamera = this.debounce(() => {
            if (this.$pages) {
                this.scrollTo(this.$pages.scrollTop);
            }
        }, 100);

        const handleSizeUpdate = (): void => {
            if (this.$content && this.pages.length > 0) {
                const { width, height } = this.$content.getBoundingClientRect();
                // @FIXME calc originY on size changes
                this.whiteboardView.moveCameraToContain({
                    originX: 0,
                    originY: this.$pages
                        ? this.$pages.scrollTop * (this.pages[0].width / width)
                        : 0,
                    width: this.pages[0].width,
                    height: (this.pages[0].width / width) * height,
                    animationMode: "immediately" as AnimationMode,
                });
                fixCamera();
            }
        };

        this.whiteboardView.callbacks.on("onSizeUpdated", handleSizeUpdate);

        this.sideEffectDisposers.push(() =>
            this.whiteboardView.callbacks.off("onSizeUpdated", handleSizeUpdate)
        );
    }

    protected debounce(fn: () => void, wait: number): () => void {
        const dFn = debounceFn(fn, { wait });
        this.sideEffectDisposers.push(() => dFn.cancel());
        return dFn;
    }

    protected wrapClassName(className: string): string {
        return "netless-app-docs-viewer-" + className;
    }

    protected pageIndex = 0;

    protected isShowPreview = false;

    protected isWritable: boolean;
    protected pages: DocsViewerPage[];
    protected box: ReadonlyTeleBox;
    protected whiteboardView: View;

    protected sideEffectDisposers: Array<() => void> = [];
}
