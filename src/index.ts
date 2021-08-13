import type { NetlessApp } from "@netless/window-manager";
import { DocsViewer, DocsViewerPage } from "./DocsViewer";

export interface NetlessAppDocsViewerAttributes {
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

        const docsViewer = new DocsViewer({
            isWritable: context.getIsWritable(),
            box,
            pages: attrs.pages || [],
            scrollTop: attrs.scrollTop,
            onScroll: (scrollTop) => {
                if (attrs.scrollTop !== scrollTop && context.getIsWritable()) {
                    context.updateAttributes(["scrollTop"], scrollTop);
                }
            },
        }).mount();

        if (import.meta.env.DEV) {
            (window as any).docsViewer = docsViewer;
        }

        context.emitter.on("attributesUpdate", (attributes) => {
            if (attributes.scrollTop != null) {
                docsViewer.syncScrollTop(attributes.scrollTop);
            }
        });

        context.emitter.on("writableChange", (isWritable) => {
            docsViewer.setWritable(isWritable);
        });
    },
};

export default NetlessAppDocsViewer;
