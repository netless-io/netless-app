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

export interface NetlessAppDocsViewerOptions {
  /** justDocsViewReadonly is used to set the docs view readonly, it will be used in the docs view, and the docs view will be readonly when the app is initialized */
  justDocsViewReadonly?: true;
  /**
   * Max time (ms) `setup()` waits for a visible page image or dynamic render
   * ticks before resolving anyway. Default: 5_000.
   */
  setupReadyTimeout?: number;
}

export interface NetlessAppDynamicDocsViewerAttributes {}

export interface AppResult {
  setDocsViewReadonly: (bol: boolean) => void;
}

const teardownByContext = new WeakMap<object, () => void>();

const DEFAULT_SETUP_READY_TIMEOUT = 5_000;

/**
 * Resolve once the first visible page image has decoded (static viewer only
 * renders visible pages, so the first `<img>` inside the box is the target).
 * `false` means timeout or teardown; remaining pages keep loading in the
 * background without blocking WindowManager's serial setup queue.
 */
const waitForFirstVisiblePage = (
  box: ReadonlyTeleBox,
  timeoutMs: number,
  isDisposed: () => boolean
): Promise<boolean> =>
  new Promise<boolean>(resolve => {
    let settled = false;
    let pollTimer: number | undefined;
    const settle = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutTimer);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      resolve(loaded);
    };
    const timeoutTimer = window.setTimeout(() => settle(false), timeoutMs);
    const check = () => {
      if (isDisposed()) return settle(false);
      const img = box.$content?.querySelector("img") as HTMLImageElement | null;
      if (img && img.complete && img.naturalWidth > 0) {
        settle(true);
      }
    };
    check();
    if (!settled) {
      pollTimer = window.setInterval(check, 100);
    }
  });

/** Wait for two frames, with timeout and explicit teardown cancellation. */
const waitForFirstRenderTick = (timeoutMs: number) => {
  let cancel!: () => void;
  const promise = new Promise<boolean>(resolve => {
    let settled = false;
    let ticks = 0;
    let frame: number | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
      if (frame !== undefined && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frame);
      }
      resolve(loaded);
    };
    const timeoutTimer = setTimeout(() => settle(false), timeoutMs);
    cancel = () => settle(false);
    const tick = () => {
      frame = undefined;
      fallbackTimer = undefined;
      if (settled) return;
      ticks += 1;
      if (ticks >= 2) return settle(true);
      schedule();
    };
    const schedule = () => {
      if (typeof requestAnimationFrame === "function") {
        frame = requestAnimationFrame(tick);
      } else {
        fallbackTimer = setTimeout(tick, 50);
      }
    };
    schedule();
  });
  return { promise, cancel: () => cancel() };
};

const NetlessAppDocsViewer: NetlessApp<
  NetlessAppStaticDocsViewerAttributes | NetlessAppDynamicDocsViewerAttributes,
  unknown,
  NetlessAppDocsViewerOptions,
  AppResult
> & { teardown(context: AppContext<any>): void } = {
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

    const isStaticViewer = !pages[0].src.startsWith("ppt");

    let docsViewer: StaticDocsViewer | DynamicDocsViewer | null = null;
    const cleanup: Array<() => void> = [];

    if (!isStaticViewer) {
      docsViewer = setupDynamicDocsViewer(
        context as AppContext<NetlessAppDynamicDocsViewerAttributes>,
        whiteboardView,
        box,
        pages
      );
    } else {
      docsViewer = setupStaticDocsViewer(
        context as AppContext<NetlessAppStaticDocsViewerAttributes>,
        whiteboardView,
        box,
        pages,
        cleanup
      );
    }
    const appOptions = context.getAppOptions() || {};

    if (appOptions.justDocsViewReadonly) {
      docsViewer.setDocsViewReadonly(true);
    }

    const setupReadyTimeout = appOptions.setupReadyTimeout ?? DEFAULT_SETUP_READY_TIMEOUT;
    const dynamicReady = isStaticViewer ? undefined : waitForFirstRenderTick(setupReadyTimeout);
    let disposed = false;
    let offDestroy: (() => void) | undefined;
    const teardown = () => {
      disposed = true;
      dynamicReady?.cancel();
      const removeDestroy = offDestroy;
      offDestroy = undefined;
      removeDestroy?.();
      cleanup
        .splice(0)
        .reverse()
        .forEach(dispose => dispose());
      docsViewer?.destroy();
      docsViewer = null;
    };
    teardownByContext.set(context, teardown);
    offDestroy = context.emitter.on("destroy", teardown);

    const appResult: AppResult = {
      setDocsViewReadonly: (bol: boolean) => {
        docsViewer?.setDocsViewReadonly(bol);
      },
    };

    // Serial setup queue support: resolve setup only after the first visible
    // content is rendered (static: first page image; dynamic: first tick).
    const ready = dynamicReady
      ? dynamicReady.promise
      : waitForFirstVisiblePage(box, setupReadyTimeout, () => disposed);

    return ready.then(() => appResult) as unknown as AppResult;
  },
  teardown(context) {
    teardownByContext.get(context)?.();
    teardownByContext.delete(context);
  },
};

export default NetlessAppDocsViewer;

function setupStaticDocsViewer(
  context: AppContext<NetlessAppStaticDocsViewerAttributes>,
  whiteboardView: View,
  box: ReadonlyTeleBox,
  pages: DocsViewerPage[],
  cleanup: Array<() => void>
): StaticDocsViewer {
  whiteboardView.disableCameraTransform = !context.getIsWritable();

  const docsViewer = new StaticDocsViewer({
    context,
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
    baseScenePath: context.getInitScenePath(),
    appId: context.appId,
  }).mount();

  docsViewer.viewer.onPageIndexChanged = index => {
    context.dispatchAppEvent("pageStateChange", { index, length: pages.length });
  };

  context.dispatchAppEvent("pageStateChange", {
    index: docsViewer.viewer.pageIndex,
    length: pages.length,
  });

  if (import.meta.env.DEV) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).docsViewer = docsViewer;
  }

  cleanup.push(
    context.emitter.on("attributesUpdate", attributes => {
      if (attributes) {
        if (attributes.pageScrollTop != null) {
          docsViewer.syncPageScrollTop(attributes.pageScrollTop);
        }
      }
    })
  );

  cleanup.push(
    context.emitter.on("writableChange", isWritable => {
      docsViewer.setReadonly(!isWritable);
      whiteboardView.disableCameraTransform = !isWritable;
    })
  );
  return docsViewer;
}

function setupDynamicDocsViewer(
  context: AppContext<NetlessAppDynamicDocsViewerAttributes>,
  whiteboardView: View,
  box: ReadonlyTeleBox,
  pages: DocsViewerPage[]
): DynamicDocsViewer {
  whiteboardView.disableCameraTransform = true;

  const docsViewer = new DynamicDocsViewer({
    context,
    whiteboardView,
    box,
    pages,
  }).mount();

  docsViewer.viewer.onPageIndexChanged = index => {
    context.dispatchAppEvent("pageStateChange", { index, length: pages.length });
  };

  context.dispatchAppEvent("pageStateChange", {
    index: docsViewer.getPageIndex(),
    length: pages.length,
  });

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
  return docsViewer;
}
