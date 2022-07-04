import styles from "./style.scss?inline";

import type { NetlessApp, AppContext, ReadonlyTeleBox } from "@netless/window-manager";
import type { Size } from "white-web-sdk";
import { StaticDocsViewer } from "./StaticDocsViewer";
import type { DocsViewerPage } from "./DocsViewer";
import { DynamicDocsViewer } from "./DynamicDocsViewer";
import { kind } from "./constants";
import { SideEffectManager } from "side-effect-manager";

export type { DocsViewerPage } from "./DocsViewer";

export interface NetlessAppStaticDocsViewerAttributes {
  /** ScrollTop base on the real page size */
  pageScrollTop?: number;
}

export interface NetlessAppDynamicDocsViewerAttributes {}

const NetlessAppDocsViewer: NetlessApp<
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

    if (pages[0].src.startsWith("ppt")) {
      setupDynamicDocsViewer(
        sideEffect,
        context as AppContext<NetlessAppDynamicDocsViewerAttributes>,
        box,
        pages
      );
    } else {
      setupStaticDocsViewer(
        sideEffect,
        context as AppContext<NetlessAppStaticDocsViewerAttributes>,
        box,
        pages
      );
    }

    sideEffect.addDisposer(
      context.emitter.on("destroy", () => {
        sideEffect.flushAll();
      })
    );
  },
};

export default NetlessAppDocsViewer;

function setupStaticDocsViewer(
  sideEffect: SideEffectManager,
  context: AppContext<NetlessAppStaticDocsViewerAttributes>,
  box: ReadonlyTeleBox,
  pages: DocsViewerPage[]
): void {
  const whiteboard = context.createWhiteBoardView({ syncCamera: false });

  whiteboard.view.disableCameraTransform = !context.isWritable;

  const storage = context.createStorage("static-docs-viewer", { pageScrollTop: 0 });

  const docsViewer = new StaticDocsViewer({
    whiteboard,
    readonly: !context.isWritable,
    box,
    pages: pages,
    pageScrollTop: storage.state.pageScrollTop,
    onUserScroll: pageScrollTop => {
      if (context.isWritable) {
        storage.setState({ pageScrollTop });
      }
    },
  }).mount();
  sideEffect.addDisposer(() => docsViewer.destroy());

  if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).docsViewer = docsViewer;
  }

  let ratio = 1;
  if (pages.length > 0) {
    const { width, height } = pages[0];
    if (height <= width) {
      ratio = height / width;
    } else {
      ratio = ((2 / 5) * height) / width;
    }
  }
  // box.setBoxRatio(ratio);
  // this ensures stage top-bottom will always touch box content area
  box.setStageRatio(ratio);

  sideEffect.addDisposer(
    storage.addStateChangedListener(diff => {
      if (diff.pageScrollTop) {
        docsViewer.syncPageScrollTop(diff.pageScrollTop.newValue || 0);
      }
    })
  );

  sideEffect.addDisposer(
    context.emitter.on("writableChange", isWritable => {
      docsViewer.setReadonly(!isWritable);
      whiteboard.view.disableCameraTransform = !isWritable;
    })
  );
}

function setupDynamicDocsViewer(
  sideEffect: SideEffectManager,
  context: AppContext<NetlessAppDynamicDocsViewerAttributes>,
  box: ReadonlyTeleBox,
  pages: DocsViewerPage[]
): void {
  const whiteboard = context.createWhiteBoardView();

  whiteboard.view.disableCameraTransform = true;

  const docsViewer = new DynamicDocsViewer({
    context,
    whiteboard,
    box,
    pages,
  }).mount();
  sideEffect.addDisposer(() => docsViewer.destroy());

  if (context.isWritable) {
    if (pages[0]) {
      whiteboard.setBaseRect({ width: pages[0].width, height: pages[0].height });
    }
  }

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
    (window as any).docsViewer = docsViewer;
  }
}
