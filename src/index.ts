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
    dynamic?: false;
    /** ScrollTop base on the real page size */
    pageScrollTop?: number;
    pages?: DocsViewerPage[];
}

export interface NetlessAppDynamicDocsViewerAttributes {
    dynamic: true;
}

const NetlessAppDocsViewer: NetlessApp<
    NetlessAppStaticDocsViewerAttributes | NetlessAppDynamicDocsViewerAttributes
> = {
    kind: "DocsViewer",
    setup(context) {
        const box = context.getBox();
        if (!box) {
            throw new Error(
                "[DocsViewer]: Missing `box` after `create` event."
            );
        }

        const attrs = context.getAttributes();

        if (!attrs) {
            throw new Error("[DocsViewer]: Missing initial attributes.");
        }

        box.mountStyles(styles);

        if (attrs.dynamic) {
            setupDynamicDocsViewer(
                context as AppContext<NetlessAppDynamicDocsViewerAttributes>,
                box
            );
        } else {
            setupStaticDocsViewer(
                context as AppContext<NetlessAppStaticDocsViewerAttributes>,
                box,
                attrs
            );
        }
    },
};

export default NetlessAppDocsViewer;

function setupStaticDocsViewer(
    context: AppContext<NetlessAppStaticDocsViewerAttributes>,
    box: ReadonlyTeleBox,
    attrs: NetlessAppStaticDocsViewerAttributes
): void {
    const pages = attrs.pages || [];

    if (pages.length <= 0) {
        throw new Error("[DocsViewer]: Missing pages.");
    }

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
        pages: attrs.pages || [],
        pagesSize,
        pageScrollTop: attrs.pageScrollTop,
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
    box: ReadonlyTeleBox
): void {
    const initScenePath = context.getInitScenePath();
    console.log(context.getDisplayer());
    if (!initScenePath) {
        throw new Error("[DocsViewer]: Missing initScenePath for dynamic ppt.");
    }

    const displayer = context.getDisplayer();
    const scenes = displayer.entireScenes()[initScenePath];

    const whiteboardView = context.getView();
    whiteboardView.disableCameraTransform = true;

    const pages = scenes
        .map((scene): DocsViewerPage | null =>
            scene.ppt
                ? {
                      src: scene.ppt.src,
                      width: scene.ppt.width,
                      height: scene.ppt.height,
                      thumbnail: scene.ppt.previewURL,
                  }
                : null
        )
        .filter((page): page is DocsViewerPage => Boolean(page));

    if (pages.length <= 0) {
        throw new Error("[DocsViewer]: Missing pages.");
    }

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
    }).mount();

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
