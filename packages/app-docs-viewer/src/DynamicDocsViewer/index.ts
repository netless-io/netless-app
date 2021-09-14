import type {
  ReadonlyTeleBox,
  View,
  Displayer,
  Room,
  AnimationMode,
} from "@netless/window-manager";
import { SideEffectManager } from "side-effect-manager";
import type { DocsViewerPage } from "../DocsViewer";
import { DocsViewer } from "../DocsViewer";
import { clamp } from "../utils/helpers";

export interface DynamicDocsViewerConfig {
  displayer: Displayer;
  whiteboardView: View;
  getRoom(): Room | undefined;
  readonly: boolean;
  box: ReadonlyTeleBox;
  pages: DocsViewerPage[];
  mountWhiteboard: (dom: HTMLDivElement) => void;
}

export class DynamicDocsViewer {
  public constructor({
    displayer,
    whiteboardView,
    getRoom,
    readonly,
    box,
    pages,
    mountWhiteboard,
  }: DynamicDocsViewerConfig) {
    this.whiteboardView = whiteboardView;
    this.readonly = readonly;
    this.box = box;
    this.pages = pages;
    this.displayer = displayer;
    this.getWhiteboardRoom = getRoom;
    this.mountWhiteboard = mountWhiteboard;

    this.viewer = new DocsViewer({
      readonly,
      box,
      pages,
      onNewPageIndex: this.onNewPageIndex,
      onPlay: this.onPlayPPT,
    });

    this.render();
  }

  protected sideEffect = new SideEffectManager();

  protected readonly: boolean;
  protected pages: DocsViewerPage[];
  protected box: ReadonlyTeleBox;
  protected whiteboardView: View;
  protected displayer: Displayer;
  protected getWhiteboardRoom: () => Room | undefined;
  protected mountWhiteboard: (dom: HTMLDivElement) => void;

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
      this.whiteboardView.callbacks.on("onSizeUpdated", this.scaleDocsToFit);
      return () => {
        this.whiteboardView.callbacks.off("onSizeUpdated", this.scaleDocsToFit);
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
    this.sideEffect.flushAll();
    this.unmount();
    this.viewer.destroy();
  }

  public getPageIndex(): number {
    return this.displayer.state.sceneState.index;
  }

  public jumpToPage(index: number, reset?: boolean): void {
    index = clamp(index, 0, this.pages.length - 1);
    if (index !== this.getPageIndex()) {
      const room = this.getWhiteboardRoom();
      if (room) {
        room.setSceneIndex(index);
        this.scaleDocsToFit();
      }
    }
    if (index !== this.viewer.pageIndex) {
      this.viewer.setPageIndex(index);
    }
    if (reset) {
      const room = this.getWhiteboardRoom();
      if (room) {
        room.setGlobalState({ __pptState: undefined });
      }
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
    this.sideEffect.addEventListener(window, "keydown", ev => {
      if (this.box.focus) {
        switch (ev.key) {
          case "ArrowUp":
          case "ArrowLeft": {
            this.jumpToPage(this.getPageIndex() - 1, true);
            break;
          }
          case "ArrowRight":
          case "ArrowDown": {
            this.getWhiteboardRoom()?.pptNextStep();
            break;
          }
          default: {
            break;
          }
        }
      }
    });
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
      this.sideEffect.addEventListener(this.$whiteboardView, "click", ev => {
        const room = this.getWhiteboardRoom();
        if (room && room.state.memberState.currentApplianceName === "clicker") {
          for (let el = ev.target as HTMLElement | null; el; el = el.parentElement) {
            if (el.classList?.contains("ppt-event-source")) {
              return;
            }
          }
          room.pptNextStep();
        }
      });
      this.mountWhiteboard(this.$whiteboardView);
    }
    return this.$whiteboardView;
  }

  protected _scaleDocsToFitImpl = (): void => {
    const page = this.pages[this.getPageIndex()];
    if (page) {
      this.whiteboardView.moveCameraToContain({
        originX: -page.width / 2,
        originY: -page.height / 2,
        width: page.width,
        height: page.height,
        animationMode: "immediately" as AnimationMode,
      });
    }
  };

  protected _scaleDocsToFitDebounced = (): void => {
    this.sideEffect.setTimeout(this._scaleDocsToFitImpl, 1000, "_scaleDocsToFitDebounced");
  };

  protected scaleDocsToFit = (): void => {
    this._scaleDocsToFitImpl();
    this._scaleDocsToFitDebounced();
  };

  protected onNewPageIndex = (index: number): void => {
    this.jumpToPage(index, true);
  };

  protected wrapClassName(className: string): string {
    return "netless-app-docs-viewer-dynamic-" + className;
  }
}
