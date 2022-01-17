import styles from "./style.scss?inline";

import type { NetlessApp, AppContext, ReadonlyTeleBox } from "@netless/window-manager";
import type { View, Size } from "white-web-sdk";
import { StaticDocsViewer } from "./StaticDocsViewer";
import type { DocsViewerPage } from "./DocsViewer";
import { DynamicDocsViewer } from "./DynamicDocsViewer";
import { kind } from "./constants";

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
    const box = context.getBox();

    const scenes = context.getScenes();
    if (!scenes) {
      throw new Error("[Docs Viewer]: scenes not found.");
    }

    const whiteboardView = context.getView();
    if (!whiteboardView) {
      throw new Error("[Docs Viewer]: no whiteboard view.");
    }

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
        context as AppContext<NetlessAppDynamicDocsViewerAttributes>,
        whiteboardView,
        box,
        pages
      );
    } else {
      setupStaticDocsViewer(
        context as AppContext<NetlessAppStaticDocsViewerAttributes>,
        whiteboardView,
        box,
        pages
      );
    }
  },
};

export default NetlessAppDocsViewer;

function setupStaticDocsViewer(
  context: AppContext<NetlessAppStaticDocsViewerAttributes>,
  whiteboardView: View,
  box: ReadonlyTeleBox,
  pages: DocsViewerPage[]
): void {
  whiteboardView.disableCameraTransform = !context.getIsWritable();

  const docsViewer = new StaticDocsViewer({
    whiteboardView,
    readonly: !context.getIsWritable(),
    box,
    pages: pages,
    pageScrollTop: context.getAttributes()?.pageScrollTop,
    mountWhiteboard: context.mountView.bind(context),
    onUserScroll: pageScrollTop => {
      if (context.getAttributes()?.pageScrollTop !== pageScrollTop && !box.readonly) {
        context.updateAttributes(["pageScrollTop"], pageScrollTop);
      }
    },
  }).mount();

  if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).docsViewer = docsViewer;
  }

  context.emitter.on("attributesUpdate", attributes => {
    if (attributes) {
      if (attributes.pageScrollTop != null) {
        docsViewer.syncPageScrollTop(attributes.pageScrollTop);
      }
    }
  });

  context.emitter.on("writableChange", isWritable => {
    docsViewer.setReadonly(!isWritable);
    whiteboardView.disableCameraTransform = !isWritable;
  });
}

function setupDynamicDocsViewer(
  context: AppContext<NetlessAppDynamicDocsViewerAttributes>,
  whiteboardView: View,
  box: ReadonlyTeleBox,
  pages: DocsViewerPage[]
): void {
  whiteboardView.disableCameraTransform = true;

  const docsViewer = new DynamicDocsViewer({
    context,
    whiteboardView,
    box,
    pages,
  }).mount();

  context.mountView(docsViewer.$whiteboardView);

  if (context.isAddApp) {
    whiteboardView.callbacks.once(
      "onSizeUpdated",
      ({ width: contentWidth, height: contentHeight }: Size) => {
        if (pages.length > 0 && box.state !== "maximized") {
          const { width: pageWidth, height: pageHeight } = pages[0];
          const preferHeight = (pageHeight / pageWidth) * contentWidth;
          const diff = preferHeight - contentHeight;
          if (diff !== 0 && context.getIsWritable()) {
            context.emitter.emit("setBoxSize", {
              width: box.width,
              height: box.height + diff / box.containerRect.height,
            });
          }
        }
      }
    );
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).docsViewer = docsViewer;
  }
}
