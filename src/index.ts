import type { Plugin, PluginContext } from "@netless/window-manager";
import { DocsViewer } from "./DocsViewer";

export interface NetlessAppDocsViewerAttributes {
    scrollPosition: 0;
}

export const NetlessAppDocsViewer: Plugin<NetlessAppDocsViewerAttributes> = {
    kind: "DocsViewer",
    config: {
        enableView: true,
    },
    setup(context: PluginContext<NetlessAppDocsViewerAttributes>): void {
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
                box,
                pages: context.displayer.entireScenes()[initScenePath],
            }).mount();

            if (import.meta.env.DEV) {
                (window as any).docsViewer = docsViewer;
            }

            context.emitter.on("attributesUpdate", (attributes) => {
                console.log("attributesUpdate", attributes);
                // @TODO sync scrolling position
            });
        });
    },
};

export default NetlessAppDocsViewer;
