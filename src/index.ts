import styles from "./style.scss?inline";

import type {
    NetlessApp,
    AppContext,
    ReadonlyTeleBox,
    Room,
} from "@netless/window-manager";
import { StaticDocsViewer } from "./StaticDocsViewer";
import { DocsViewerPage } from "./DocsViewer";
import { DynamicDocsViewer } from "./DynamicDocsViewer";

export type { DocsViewerPage } from "./DocsViewer";

export interface NetlessAppStaticDocsViewerAttributes {
    /** ScrollTop base on the real page size */
    pageScrollTop?: number;
}

export interface NetlessAppDynamicDocsViewerAttributes {}

const NetlessAppDocsViewer: NetlessApp<
    NetlessAppStaticDocsViewerAttributes | NetlessAppDynamicDocsViewerAttributes
> = {
    kind: "DocsViewer",
    config: {
        minwidth: 320,
        minheight: 200,
    },
    setup(context) {
        const box = context.getBox();

        const scenes = context.getScenes();
        if (!scenes) {
            throw new Error("[Docs Viewer]: scenes not found.");
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
                box,
                pages
            );
        } else {
            setupStaticDocsViewer(
                context as AppContext<NetlessAppStaticDocsViewerAttributes>,
                box,
                pages
            );
        }
    },
};

export default NetlessAppDocsViewer;

function setupStaticDocsViewer(
    context: AppContext<NetlessAppStaticDocsViewerAttributes>,
    box: ReadonlyTeleBox,
    pages: DocsViewerPage[]
): void {
    const pagesSize = {
        width: pages[0].width,
        height: pages.reduce(
            (height, page) =>
                height + page.height * (pages[0].width / page.width),
            0
        ),
    };

    const whiteboardView = context.getView();
    whiteboardView.disableCameraTransform = true;

    const docsViewer = new StaticDocsViewer({
        whiteboardView,
        readonly: box.readonly,
        box,
        pages: pages,
        pagesSize,
        pageScrollTop: context.getAttributes()?.pageScrollTop,
        mountWhiteboard: context.mountView.bind(context),
        onUserScroll: (pageScrollTop) => {
            if (
                context.getAttributes()?.pageScrollTop !== pageScrollTop &&
                !box.readonly
            ) {
                context.updateAttributes(["pageScrollTop"], pageScrollTop);
            }
        },
    }).mount();

    if (import.meta.env.DEV) {
        (window as any).docsViewer = docsViewer;
    }

    context.emitter.on("attributesUpdate", (attributes) => {
        if (attributes) {
            if (attributes.pageScrollTop != null) {
                docsViewer.syncPageScrollTop(attributes.pageScrollTop);
            }
        }
    });

    box.events.on("readonly", (readonly) => {
        docsViewer.setReadonly(readonly);
    });
}

function setupDynamicDocsViewer(
    context: AppContext<NetlessAppDynamicDocsViewerAttributes>,
    box: ReadonlyTeleBox,
    pages: DocsViewerPage[]
): void {
    const displayer = context.getDisplayer();

    const whiteboardView = context.getView();
    whiteboardView.disableCameraTransform = true;

    const docsViewer = new DynamicDocsViewer({
        displayer,
        whiteboardView,
        getRoom: () =>
            context.getIsWritable()
                ? (context.getDisplayer() as Room)
                : undefined,
        readonly: box.readonly,
        box,
        pages,
        mountWhiteboard: context.mountView.bind(context),
    }).mount();

    context.mountView(docsViewer.$whiteboardView);

    if (import.meta.env.DEV) {
        (window as any).docsViewer = docsViewer;
    }

    context.emitter.on("sceneStateChange", (sceneState) => {
        docsViewer.jumpToPage(sceneState.index);
    });

    box.events.on("readonly", (readonly) => {
        docsViewer.setReadonly(readonly);
    });
}
