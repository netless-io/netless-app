import type {
    ReadonlyTeleBox,
    View,
    Displayer,
    Room,
} from "@netless/window-manager";
import { SideEffectManager } from "../utils/SideEffectManager";
import { DocsViewer, DocsViewerPage } from "../DocsViewer";
import { clamp } from "../utils/helpers";

export interface DynamicDocsViewerConfig {
    displayer: Displayer;
    whiteboardView: View;
    getRoom(): Room | undefined;
    readonly: boolean;
    box: ReadonlyTeleBox;
    pages: DocsViewerPage[];
}

export class DynamicDocsViewer {
    public constructor({
        displayer,
        whiteboardView,
        getRoom,
        readonly,
        box,
        pages,
    }: DynamicDocsViewerConfig) {
        this.whiteboardView = whiteboardView;
        this.readonly = readonly;
        this.box = box;
        this.pages = pages;
        this.displayer = displayer;
        this.getWhiteboardRoom = getRoom;

        this.viewer = new DocsViewer({
            readonly,
            box,
            pages,
            onNewPageIndex: this.onNewPageIndex,
            onPlay: this.onPlayPPT,
        });

        this.render();
    }

    protected readonly: boolean;
    protected pages: DocsViewerPage[];
    protected box: ReadonlyTeleBox;
    protected whiteboardView: View;
    protected displayer: Displayer;
    protected getWhiteboardRoom: () => Room | undefined;

    public viewer: DocsViewer;

    public $mask!: HTMLElement;
    public $whiteboardView!: HTMLDivElement;

    public mount(): this {
        this.viewer.mount();

        const pageIndex = this.getPageIndex();
        if (pageIndex !== 0) {
            this.jumpToPage(pageIndex);
        }

        this.scaleDocsToFit();
        this.sideEffect.add(() => {
            this.whiteboardView.callbacks.on(
                "onSizeUpdated",
                this.scaleDocsToFit
            );
            return () => {
                this.whiteboardView.callbacks.off(
                    "onSizeUpdated",
                    this.scaleDocsToFit
                );
            };
        });

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
        this.unmount();
        this.viewer.destroy();
    }

    public getPageIndex(): number {
        return this.displayer.state.sceneState.index;
    }

    public jumpToPage(index: number): void {
        index = clamp(index, 0, this.pages.length - 1);
        if (index !== this.getPageIndex()) {
            const room = this.getWhiteboardRoom();
            if (room) {
                room.setSceneIndex(index);
            }
        }
        if (index !== this.viewer.pageIndex) {
            this.viewer.setPageIndex(index);
        }
    }

    public onPlayPPT = (): void => {
        const room = this.getWhiteboardRoom();
        if (room) {
            room.pptNextStep();
        }
    };

    public render(): void {
        this.viewer.$content.appendChild(this.renderMask());
        this.viewer.$content.appendChild(this.renderWhiteboardView());
    }

    protected renderMask(): HTMLElement {
        if (!this.$mask) {
            const $mask = document.createElement("div");
            $mask.className = this.wrapClassName("mask");
            this.$mask = $mask;

            const $back = document.createElement("button");
            $back.className = this.wrapClassName("back");

            const $next = document.createElement("button");
            $next.className = this.wrapClassName("next");

            // this.$mask.appendChild($back)
            // this.$mask.appendChild($next)
        }
        return this.$mask;
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
                    console.log("scroll", ev.deltaY, ev.deltaX);
                },
                { passive: false, capture: true }
            );
            // @TODO support swipe
        }
        return this.$whiteboardView;
    }

    protected scaleDocsToFit = (): void => {
        const page = this.pages[this.getPageIndex()];
        if (page) {
            this.whiteboardView.moveCameraToContain({
                originX: -page.width / 2,
                originY: -page.height / 2,
                width: page.width,
                height: page.height,
            });
        }
    };

    protected onNewPageIndex = (index: number): void => {
        this.jumpToPage(index);
    };

    protected wrapClassName(className: string): string {
        return "netless-app-docs-viewer-dynamic-" + className;
    }

    protected sideEffect = new SideEffectManager();
}
