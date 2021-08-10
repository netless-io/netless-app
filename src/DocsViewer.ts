import { ReadonlyTeleBox, WhiteScene } from "@netless/window-manager";
import LazyLoad, { ILazyLoadInstance } from "vanilla-lazyload";

export interface DocsViewerConfig {
    box: ReadonlyTeleBox;
    pages: WhiteScene[];
}

const DOCS_VIEWER_IMG_CLASSNAME = "netless-app-docs-viewer-img";

export class DocsViewer {
    public constructor({ box, pages }: DocsViewerConfig) {
        this.box = box;
        this.pages = pages;
        this.maxImgWidth = Math.max(
            ...this.pages.map((page) => page.ppt?.width || 0),
            0
        );
    }

    public $content: HTMLElement | undefined;

    public mount(): this {
        const $content = this.renderContent();
        this.box.mountContent($content);

        if (!this.lazyLoad) {
            this.lazyLoad = new LazyLoad({
                container: $content,
                elements_selector: `.${DOCS_VIEWER_IMG_CLASSNAME}`,
            });
        }

        return this;
    }

    public unmount(): this {
        if (this.$content) {
            this.$content.remove();
        }
        return this;
    }

    public destroy(): void {
        if (this.lazyLoad) {
            this.lazyLoad.destroy();
        }
        this.unmount();
    }

    protected renderContent(): HTMLElement {
        if (!this.$content) {
            const $content = document.createElement("div");
            this.$content = $content;

            this.pages.forEach((page) => {
                if (page.ppt) {
                    const $img = document.createElement("img");
                    $img.className = DOCS_VIEWER_IMG_CLASSNAME;
                    $img.width = page.ppt.width;
                    $img.height = page.ppt.height;
                    $img.style.display = "block";
                    $img.style.width = "100%";
                    $img.style.height = "auto";
                    $img.dataset.src = page.ppt.src;

                    $content.appendChild($img);
                }
            });
        }
        return this.$content;
    }

    protected pages: WhiteScene[];

    protected maxImgWidth: number;

    protected box: ReadonlyTeleBox;

    protected lazyLoad: ILazyLoadInstance | undefined;
}
