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

        const whiteboardView = context.getView();
        whiteboardView.disableCameraTransform = true;

        const docsViewer = new DocsViewer({
            whiteboardView,
            isWritable: context.getIsWritable(),
            box,
            pages: attrs.pages || [],
            scrollTop: (attrs.scrollTop ?? 0) * box.height,
            onUserScroll: (scrollTop) => {
                const ratio = scrollTop / box.height;
                if (attrs.scrollTop !== ratio && context.getIsWritable()) {
                    context.updateAttributes(["scrollTop"], ratio);
                }
            },
        }).mount();

        if (import.meta.env.DEV) {
            (window as any).docsViewer = docsViewer;
        }

        context.emitter.on("attributesUpdate", (attributes) => {
            if (attributes?.scrollTop != null) {
                docsViewer.syncScrollTop(attributes.scrollTop * box.height);
            }
        });

        context.emitter.on("writableChange", (isWritable) => {
            docsViewer.setWritable(isWritable);
        });
    },
};

export default NetlessAppDocsViewer;
