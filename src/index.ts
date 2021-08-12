import type { Plugin, PluginContext } from "@netless/window-manager";
import { DocsViewer } from "./DocsViewer";

export interface NetlessAppDocsViewerAttributes {
    scrollTop: number;
}

const NetlessAppDocsViewer: Plugin<NetlessAppDocsViewerAttributes> = {
    kind: "DocsViewer",
    config: {
        enableView: true,
    },
    setup(context: PluginContext<NetlessAppDocsViewerAttributes>): void {
        // context.displayer.
        context.emitter.on("create", () => {
            const initScenePath = context.initScenePath;
            if (initScenePath == null) {
                throw new Error("[DocsViewer]: PPT Init Scene Path missing.");
            }

            const box = context.box;
            if (!box) {
                throw new Error(
                    "[DocsViewer]: Missing `box` after `create` event."
                );
            }

            const docsViewer = new DocsViewer({
                isWritable: context.isWritable,
                box,
                pages: context.displayer.entireScenes()[initScenePath],
                onScroll: (scrollTop) => {
                    if (context.isWritable) {
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
        });
    },
};

export default NetlessAppDocsViewer;
