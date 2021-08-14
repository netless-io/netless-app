import type { NetlessApp } from "@netless/window-manager";
import { DocsViewer, DocsViewerPage } from "./DocsViewer";

export interface NetlessAppDocsViewerAttributes {
    /** 0~1 */
    scrollTop?: number;
    pages?: DocsViewerPage[];
}

const NetlessAppDocsViewer: NetlessApp<NetlessAppDocsViewerAttributes> = {
    kind: "DocsViewer",
    setup(context): void {
        const box = context.getBox();
        if (!box) {
            throw new Error(
                "[DocsViewer]: Missing `box` after `create` event."
            );
        }

        const attrs = context.getAttributes() || {};
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

        const docsViewer = new DocsViewer({
            whiteboardView,
            isWritable: context.getIsWritable(),
            box,
            pages: attrs.pages || [],
            pagesSize,
            scrollTop: attrs.scrollTop,
            onUserScroll: (scrollTop) => {
                if (
                    context.getAttributes()?.scrollTop !== scrollTop &&
                    context.getIsWritable()
                ) {
                    context.updateAttributes(["scrollTop"], scrollTop);
                }
            },
        }).mount();

        if (import.meta.env.DEV) {
            (window as any).docsViewer = docsViewer;
        }

        context.emitter.on("attributesUpdate", (attributes) => {
            if (attributes?.scrollTop != null) {
                docsViewer.syncScrollTop(attributes.scrollTop);
            }
        });

        context.emitter.on("writableChange", (isWritable) => {
            docsViewer.setWritable(isWritable);
        });
    },
};

export default NetlessAppDocsViewer;
