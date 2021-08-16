import sidebarSVG from "./icons/sidebar.svg";
import arrowLeftSVG from "./icons/arrow-left.svg";
import arrowRightSVG from "./icons/arrow-right.svg";
import playSVG from "./icons/play.svg";
import pauseSVG from "./icons/pause.svg";

import { ReadonlyTeleBox } from "@netless/window-manager";
import LazyLoad from "vanilla-lazyload";
import debounceFn from "debounce-fn";
import { SideEffectManager } from "../utils/SideEffectManager";

export interface DocsViewerPage {
    src: string;
    height: number;
    width: number;
    thumbnail?: string;
}

export interface DocsViewerConfig {
    readonly: boolean;
    box: ReadonlyTeleBox;
    pages: DocsViewerPage[];
    onNewPageIndex: (index: number) => void;
    onPlay?: () => void;
}

export class DocsViewer {
    public constructor({
        readonly,
        box,
        pages,
        onNewPageIndex,
        onPlay,
    }: DocsViewerConfig) {
        if (pages.length <= 0) {
            throw new Error("[DocsViewer] Empty pages.");
        }

        this.readonly = readonly;
        this.box = box;
        this.pages = pages;
        this.onNewPageIndex = onNewPageIndex;
        this.onPlay = onPlay;

        this.render();
    }

    protected readonly: boolean;
    protected pages: DocsViewerPage[];
    protected box: ReadonlyTeleBox;
    protected onNewPageIndex: (index: number) => void;
    protected onPlay?: () => void;

    public $content!: HTMLElement;
    public $preview!: HTMLElement;
    public $previewMask!: HTMLElement;
    public $footer!: HTMLElement;
    public $pageNumberInput!: HTMLInputElement;

    public pageIndex = 0;

    public mount(): void {
        this.box.mountContent(this.$content);
        this.box.mountFooter(this.$footer);

        this.sideEffect.add(() => {
            const previewLazyLoad = new LazyLoad({
                container: this.$preview,
                elements_selector: `.${this.wrapClassName("preview-page>img")}`,
            });
            return () => previewLazyLoad.destroy();
        }, "preview-lazyload");
    }

    public unmount(): void {
        this.$content.remove();
        this.$footer.remove();
    }

    public setReadonly(readonly: boolean): void {
        if (this.readonly !== readonly) {
            this.readonly = readonly;

            this.$content.classList.toggle(
                this.wrapClassName("readonly"),
                readonly
            );

            this.$footer.classList.toggle(
                this.wrapClassName("readonly"),
                readonly
            );

            this.$pageNumberInput.disabled = readonly;
        }
    }

    public destroy(): void {
        this.sideEffect.flush();
        this.unmount();
    }

    public setPageIndex(pageIndex: number): void {
        if (!Number.isNaN(pageIndex)) {
            this.pageIndex = pageIndex;
            this.$pageNumberInput.value = String(pageIndex + 1);
        }
    }

    public render(): HTMLElement {
        this.renderContent();
        this.renderFooter();
        return this.$content;
    }

    protected renderContent(): HTMLElement {
        if (!this.$content) {
            const $content = document.createElement("div");
            $content.className = this.wrapClassName("content");
            this.$content = $content;

            if (this.readonly) {
                $content.classList.add(this.wrapClassName("readonly"));
            }

            $content.appendChild(this.renderPreviewMask());
            $content.appendChild(this.renderPreview());
        }
        return this.$content;
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

            this.sideEffect.addEventListener($preview, "click", (ev) => {
                if (this.readonly) {
                    return;
                }
                const pageIndex = (ev.target as HTMLElement).dataset?.pageIndex;
                if (pageIndex) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    ev.stopImmediatePropagation();
                    this.onNewPageIndex(Number(pageIndex));
                }
            });
        }

        return this.$preview;
    }

    protected renderPreviewMask(): HTMLElement {
        if (!this.$previewMask) {
            this.$previewMask = document.createElement("div");
            this.$previewMask.className = this.wrapClassName("preview-mask");
            this.sideEffect.addEventListener(
                this.$previewMask,
                "click",
                (ev) => {
                    if (this.readonly) {
                        return;
                    }
                    if (ev.target === this.$previewMask) {
                        this.togglePreview(false);
                    }
                }
            );
        }
        return this.$previewMask;
    }

    protected renderFooter(): HTMLElement {
        if (!this.$footer) {
            const $footer = document.createElement("div");
            $footer.className = this.wrapClassName("footer");
            this.$footer = $footer;

            if (this.readonly) {
                $footer.classList.add(this.wrapClassName("readonly"));
            }

            const $btnSidebar = this.renderFooterBtn("btn-sidebar", sidebarSVG);
            this.sideEffect.addEventListener($btnSidebar, "click", () => {
                if (this.readonly) {
                    return;
                }
                this.togglePreview();
            });

            const $pageJumps = document.createElement("div");
            $pageJumps.className = this.wrapClassName("page-jumps");

            const $btnPageBack = this.renderFooterBtn(
                "btn-page-back",
                arrowLeftSVG
            );
            this.sideEffect.addEventListener($btnPageBack, "click", () => {
                if (this.readonly) {
                    return;
                }
                this.onNewPageIndex(this.pageIndex - 1);
            });
            $pageJumps.appendChild($btnPageBack);

            if (this.onPlay) {
                const $btnPlay = this.renderFooterBtn("btn-page-play", playSVG);
                const returnPlay = this.debounce(() => {
                    const img = $btnPlay.querySelector("img");
                    if (img) {
                        img.src = playSVG;
                    }
                }, 500);
                this.sideEffect.addEventListener($btnPlay, "click", () => {
                    if (this.readonly) {
                        return;
                    }
                    const img = $btnPlay.querySelector("img");
                    if (img) {
                        img.src = pauseSVG;
                    }
                    if (this.onPlay) {
                        this.onPlay();
                    }
                    returnPlay();
                });

                $pageJumps.appendChild($btnPlay);
            }

            const $btnPageNext = this.renderFooterBtn(
                "btn-page-next",
                arrowRightSVG
            );
            this.sideEffect.addEventListener($btnPageNext, "click", () => {
                if (this.readonly) {
                    return;
                }
                this.onNewPageIndex(this.pageIndex + 1);
            });
            $pageJumps.appendChild($btnPageNext);

            const $pageNumber = document.createElement("div");
            $pageNumber.className = this.wrapClassName("page-number");

            const $pageNumberInput = document.createElement("input");
            $pageNumberInput.className =
                this.wrapClassName("page-number-input");
            $pageNumberInput.value = String(this.pageIndex + 1);
            if (this.readonly) {
                $pageNumberInput.disabled = true;
            }
            this.$pageNumberInput = $pageNumberInput;
            this.sideEffect.addEventListener($pageNumberInput, "change", () => {
                if (this.readonly) {
                    return;
                }
                if ($pageNumberInput.value) {
                    this.onNewPageIndex(Number($pageNumberInput.value) - 1);
                }
            });

            const $totalPage = document.createElement("span");
            $totalPage.textContent = " / " + this.pages.length;

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

    protected togglePreview(isShowPreview?: boolean): void {
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

    protected debounce(fn: () => void, wait: number): () => void {
        const dFn = debounceFn(fn, { wait });
        this.sideEffect.addDisposer(() => dFn.cancel());
        return dFn;
    }

    protected wrapClassName(className: string): string {
        return "netless-app-docs-viewer-" + className;
    }

    protected isShowPreview = false;

    protected sideEffect = new SideEffectManager();
}
