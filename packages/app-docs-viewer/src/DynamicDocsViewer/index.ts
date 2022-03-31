import type {
  ReadonlyTeleBox,
  View,
  Displayer,
  AnimationMode,
  AppContext,
  SceneState,
} from "@netless/window-manager";
import { SideEffectManager } from "side-effect-manager";
import type { DocsViewerPage } from "../DocsViewer";
import { DocsViewer } from "../DocsViewer";
import { clamp } from "../utils/helpers";

export interface DynamicDocsViewerConfig {
  context: AppContext;
  whiteboardView: View;
  box: ReadonlyTeleBox;
  pages: DocsViewerPage[];
}

export class DynamicDocsViewer {
  public constructor({ context, whiteboardView, box, pages }: DynamicDocsViewerConfig) {
    this.context = context;
    this.whiteboardView = whiteboardView;
    this.box = box;
    this.pages = pages;
    this.displayer = context.getDisplayer();

    this.viewer = new DocsViewer({
      readonly: !context.getIsWritable(),
      box,
      pages,
      onNewPageIndex: this.onNewPageIndex,
      onPlay: this.onPlayPPT,
    });

    this.render();

    this.sideEffect.add(() => {
      const handler = (isWritable: boolean): void => {
        this.viewer.setReadonly(!isWritable);
      };
      this.context.emitter.on("writableChange", handler);
      return () => this.context.emitter.off("writableChange", handler);
    });

    this.sideEffect.add(() => {
      const handler = (sceneState: SceneState) => {
        this.jumpToPage(sceneState.index);
      };
      this.context.emitter.on("sceneStateChange", handler);
      return () => this.context.emitter.off("sceneStateChange", handler);
    });
  }

  protected sideEffect = new SideEffectManager();

  protected context: AppContext;
  protected pages: DocsViewerPage[];
  protected box: ReadonlyTeleBox;
  protected whiteboardView: View;
  protected displayer: Displayer;

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
      if (this.context.getIsWritable()) {
        const initScenePath = this.context.getInitScenePath();
        const scene = this.context.getScenes()?.[index]?.name;
        if (initScenePath && scene) {
          this.context.setScenePath(`${initScenePath}/${scene}`);
        }
        this.scaleDocsToFit();
      }
    }
    if (index !== this.viewer.pageIndex) {
      this.viewer.setPageIndex(index);
    }
    if (reset) {
      const room = this.context.getRoom();
      if (room) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pptState = (room.state.globalState as any).__pptState;
        room.setGlobalState({
          __pptState: pptState && {
            uuid: pptState.uuid,
            pageIndex: index,
            disableAutoPlay: pptState.disableAutoPlay,
          },
        });
      }
    }
  }

  public onPlayPPT = (): void => {
    const room = this.context.getRoom();
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
            this.context.getRoom()?.pptNextStep();
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
        const room = this.context.getRoom();
        if (room && room.state.memberState.currentApplianceName === "clicker") {
          for (let el = ev.target as HTMLElement | null; el; el = el.parentElement) {
            if (el.classList?.contains("ppt-event-source")) {
              return;
            }
          }
          room.pptNextStep();
        }
      });
      this.context.mountView(this.$whiteboardView);
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
      this.whiteboardView.setCameraBound({
        damping: 1,
        maxContentMode: () => this.whiteboardView.camera.scale,
        minContentMode: () => this.whiteboardView.camera.scale,
        centerX: 0,
        centerY: 0,
        width: page.width,
        height: page.height,
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
