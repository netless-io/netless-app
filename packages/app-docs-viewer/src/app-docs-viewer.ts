import styles from "./style.scss?inline";

import type { NetlessApp, AppContext, ReadonlyTeleBox } from "@netless/window-manager";
import type { Size } from "white-web-sdk";
import { StaticDocsViewer } from "./StaticDocsViewer";
import type { DocsViewerPage } from "./DocsViewer";
import { DynamicDocsViewer } from "./DynamicDocsViewer";
import { kind } from "./constants";
import { SideEffectManager } from "side-effect-manager";
import type { ReadonlyVal } from "value-enhancer";
import { combine, Val } from "value-enhancer";
import { sameSize } from "./utils/helpers";

export interface NetlessAppStaticDocsViewerAttributes {
  /** ScrollTop base on the real page size */
  pageScrollTop?: number;
}

export interface NetlessAppDynamicDocsViewerAttributes {}

export const NetlessAppDocsViewer: NetlessApp<
  NetlessAppStaticDocsViewerAttributes | NetlessAppDynamicDocsViewerAttributes
> = {
  kind,
  setup(context) {
    const box = context.box;

    const scenes = context.getScenes();
    if (!scenes) {
      throw new Error("[Docs Viewer]: scenes not found.");
    }

    const sideEffect = new SideEffectManager();

    const pages = scenes
      .map(({ ppt }): DocsViewerPage | null =>
        ppt
          ? {
              width: ppt.width,
              height: ppt.height,
              src: ppt.src,
              thumbnail: ppt.previewURL,
            }
          : null
      )
      .filter((page): page is DocsViewerPage => Boolean(page));

    if (pages.length <= 0) {
      throw new Error("[Docs Viewer]: empty scenes.");
    }

    box.mountStyles(styles);

    const readonly$ = new Val(!context.isWritable);
    sideEffect.addDisposer(
      context.emitter.on("writableChange", isWritable => {
        readonly$.setValue(!isWritable);
      })
    );

    if (pages[0].src.startsWith("ppt")) {
      setupDynamicDocsViewer(
        sideEffect,
        context as AppContext<NetlessAppDynamicDocsViewerAttributes>,
        box,
        pages,
        readonly$
      );
    } else {
      setupStaticDocsViewer(
        sideEffect,
        context as AppContext<NetlessAppStaticDocsViewerAttributes>,
        box,
        pages,
        readonly$
      );
    }

    sideEffect.addDisposer(
      context.emitter.on("destroy", () => {
        sideEffect.flushAll();
      })
    );
  },
};

function setupStaticDocsViewer(
  sideEffect: SideEffectManager,
  context: AppContext<NetlessAppStaticDocsViewerAttributes>,
  box: ReadonlyTeleBox,
  pages: DocsViewerPage[],
  readonly$: Val<boolean>
): void {
  const whiteboard = context.createWhiteBoardView({ syncCamera: false });

  sideEffect.addDisposer(
    readonly$.subscribe(readonly => {
      whiteboard.view.disableCameraTransform = readonly;
    })
  );

  const storage = context.createStorage("static-docs-viewer", { pagesScrollTop: 0 });

  const staticDocsViewer = new StaticDocsViewer({
    whiteboard,
    readonly$,
    box,
    pages,
    pagesScrollTop: storage.state.pagesScrollTop,
    onUserScroll: pagesScrollTop => {
      if (context.isWritable) {
        storage.setState({ pagesScrollTop });
      }
    },
  });
  sideEffect.addDisposer(() => staticDocsViewer.destroy());

  sideEffect.addDisposer(
    storage.on("stateChanged", diff => {
      if (diff.pagesScrollTop) {
        staticDocsViewer.syncPageScrollTop(diff.pagesScrollTop.newValue || 0);
      }
    })
  );

  //  ensure stage top-bottom will always touch box content area
  sideEffect.addDisposer(
    combine(
      [
        box._maximized$,
        box._managerStageRect$,
        box._intrinsicSize$,
        staticDocsViewer.pagesSize$,
        staticDocsViewer.pageRenderer._pagesMinHeight$,
      ],
      ([maximized, managerStageRect, size, pagesSize, pagesMinHeight]) =>
        maximized
          ? Math.max(
              (pagesMinHeight / pagesSize.width) * (2 / 5),
              managerStageRect.height / managerStageRect.width
            )
          : (size.height / size.width) * (managerStageRect.height / managerStageRect.width)
    ).subscribe(ratio => {
      box.setStageRatio(ratio);
    })
  );

  if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).staticDocsViewer = staticDocsViewer;
  }
}

function setupDynamicDocsViewer(
  sideEffect: SideEffectManager,
  context: AppContext<NetlessAppDynamicDocsViewerAttributes>,
  box: ReadonlyTeleBox,
  pages: DocsViewerPage[],
  readonly$: ReadonlyVal<boolean>
): void {
  const whiteboard = context.createWhiteBoardView();

  whiteboard.view.disableCameraTransform = true;

  const dynamicDocsViewer = new DynamicDocsViewer({
    context,
    whiteboard,
    box,
    pages,
    readonly$,
  });
  sideEffect.addDisposer(() => dynamicDocsViewer.destroy());

  const whiteboardBaseRect$ = new Val(
    { width: pages[0].width, height: pages[0].height },
    { compare: sameSize }
  );

  sideEffect.addDisposer(
    dynamicDocsViewer.pagesIndex$.subscribe(pageIndex => {
      const page = pages[pageIndex];
      if (page) {
        whiteboardBaseRect$.setValue({ width: page.width, height: page.height });
      }
    })
  );

  sideEffect.addDisposer(
    whiteboardBaseRect$.subscribe(rect => {
      if (!readonly$.value) {
        whiteboard.setBaseRect(rect);
      }
    })
  );

  if (context.isAddApp) {
    const disposerID = sideEffect.add(() => {
      const handler = ({ width: contentWidth, height: contentHeight }: Size) => {
        if (pages.length > 0 && box.state !== "maximized") {
          const { width: pageWidth, height: pageHeight } = pages[0];
          const preferHeight = (pageHeight / pageWidth) * contentWidth;
          const diff = preferHeight - contentHeight;
          if (diff !== 0 && context.isWritable) {
            context.emitter.emit("setBoxSize", {
              width: box.intrinsicWidth,
              height: box.intrinsicHeight + diff / box.rootRect.height,
            });
          }
        }
        sideEffect.remove(disposerID);
      };
      whiteboard.view.callbacks.once("onSizeUpdated", handler);
      return () => whiteboard.view.callbacks.off("onSizeUpdated", handler);
    });
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).dynamicDocsViewer = dynamicDocsViewer;
  }
}
