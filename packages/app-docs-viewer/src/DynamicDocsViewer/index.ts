import type {
  ReadonlyTeleBox,
  AppContext,
  SceneState,
  WhiteBoardView,
} from "@netless/window-manager";
import { SideEffectManager } from "side-effect-manager";
import type { ReadonlyVal } from "value-enhancer";
import { Val } from "value-enhancer";
import type { DocsViewerPage } from "../DocsViewer";
import { DocsViewer } from "../DocsViewer";
import { clamp } from "../utils/helpers";

export interface DynamicDocsViewerConfig {
  readonly$: ReadonlyVal<boolean>;
  context: AppContext;
  whiteboard: WhiteBoardView;
  box: ReadonlyTeleBox;
  pages: DocsViewerPage[];
}

export class DynamicDocsViewer {
  public pagesIndex$: Val<number, boolean>;

  public constructor({ readonly$, context, whiteboard, box, pages }: DynamicDocsViewerConfig) {
    this.context = context;
    this.whiteboard = whiteboard;
    this.box = box;
    this.pages = pages;

    const pagesIndex$ = new Val<number, boolean>(context.displayer.state.sceneState.index || 0);
    this.pagesIndex$ = pagesIndex$;

    this.sideEffect.add(() => {
      const handler = (sceneState: SceneState) => {
        this.jumpToPage(sceneState.index);
      };
      this.context.emitter.on("sceneStateChange", handler);
      return () => this.context.emitter.off("sceneStateChange", handler);
    });

    this.viewer = new DocsViewer({
      readonly$,
      pagesIndex$,
      box,
      pages,
      playable: true,
    });

    this.sideEffect.addDisposer([
      this.viewer.events.on("jumpPage", pageIndex => this.jumpToPage(pageIndex, true)),
      this.viewer.events.on("play", () => this.context.room?.pptNextStep()),
      this.viewer.events.on("back", () => this.prevPage()),
      this.viewer.events.on("next", () => this.nextPage()),
    ]);

    this.render();

    this.sideEffect.addDisposer(
      pagesIndex$.subscribe((pageIndex, isUserAction) => {
        if (readonly$.value) return;

        const initScenePath = this.context.getInitScenePath();
        const scene = this.context.getScenes()?.[pageIndex]?.name;
        if (initScenePath && scene) {
          this.context.setScenePath(`${initScenePath}/${scene}`);
        }

        if (isUserAction) {
          const room = this.context.room;
          if (room) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pptState = (room.state.globalState as any).__pptState;
            room.setGlobalState({
              __pptState: pptState && {
                uuid: pptState.uuid,
                pageIndex,
                disableAutoPlay: pptState.disableAutoPlay,
              },
            });
          }
        }
      })
    );
  }

  protected sideEffect = new SideEffectManager();

  protected context: AppContext;
  protected pages: DocsViewerPage[];
  protected box: ReadonlyTeleBox;
  protected whiteboard: WhiteBoardView;

  public viewer: DocsViewer;

  public destroy(): void {
    this.sideEffect.flushAll();
    this.viewer.destroy();
  }

  public nextPage(): void {
    this.jumpToPage(this.pagesIndex$.value + 1, true);
  }

  public prevPage(): void {
    this.jumpToPage(this.pagesIndex$.value - 1, true);
  }

  public jumpToPage(pageIndex: number, isUserAction = false): void {
    this.pagesIndex$.setValue(clamp(pageIndex, 0, this.pages.length - 1), isUserAction);
  }

  public render(): void {
    this.box.mountStage(document.createElement("div"));

    this.sideEffect.addEventListener(window, "keydown", ev => {
      if (this.box.focus) {
        switch (ev.key) {
          case "ArrowUp":
          case "ArrowLeft": {
            this.prevPage();
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
