import type {
  ReadonlyTeleBox,
  Displayer,
  AppContext,
  SceneState,
  WhiteBoardView,
} from "@netless/window-manager";
import { SideEffectManager } from "side-effect-manager";
import type { DocsViewerPage } from "../DocsViewer";
import { DocsViewer } from "../DocsViewer";
import { clamp } from "../utils/helpers";

export interface DynamicDocsViewerConfig {
  context: AppContext;
  whiteboard: WhiteBoardView;
  box: ReadonlyTeleBox;
  pages: DocsViewerPage[];
}

export class DynamicDocsViewer {
  public constructor({ context, whiteboard, box, pages }: DynamicDocsViewerConfig) {
    this.context = context;
    this.whiteboard = whiteboard;
    this.box = box;
    this.pages = pages;
    this.displayer = context.displayer;

    this.viewer = new DocsViewer({
      readonly: !context.isWritable,
      box,
      pages,
      onPlay: () => this.context.room?.pptNextStep(),
    });

    this.sideEffect.addDisposer(
      this.viewer.onValChanged(
        "pageIndex",
        (index, isUserAction) => isUserAction && this.jumpToPage(index, true)
      )
    );

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
  protected whiteboard: WhiteBoardView;
  protected displayer: Displayer;

  public viewer: DocsViewer;

  public $mask!: HTMLElement;

  public mount(): this {
    this.viewer.mount();

    const pageIndex = this.getPageIndex();
    if (pageIndex !== 0) {
      this.jumpToPage(pageIndex);
    }

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
      if (this.context.isWritable) {
        const initScenePath = this.context.getInitScenePath();
        const scene = this.context.getScenes()?.[index]?.name;
        if (initScenePath && scene) {
          this.context.setScenePath(`${initScenePath}/${scene}`);
        }
      }
    }
    if (index !== this.viewer.pageIndex) {
      this.viewer.setPageIndex(index);
    }
    if (reset) {
      const room = this.context.room;
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

  public render(): void {
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
            this.context.room?.pptNextStep();
            break;
          }
          default: {
            break;
          }
        }
      }
    });
    const whiteboardWrapper = this.whiteboard.view.divElement?.parentElement;
    if (whiteboardWrapper) {
      this.sideEffect.addEventListener(whiteboardWrapper, "click", ev => {
        const room = this.context.room;
        if (room && room.state.memberState.currentApplianceName === "clicker") {
          for (let el = ev.target as HTMLElement | null; el; el = el.parentElement) {
            if (el.classList?.contains("ppt-event-source")) {
              return;
            }
          }
          room.pptNextStep();
        }
      });
    }
  }

  protected wrapClassName(className: string): string {
    return "netless-app-docs-viewer-dynamic-" + className;
  }
}
