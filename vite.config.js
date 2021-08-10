/* eslint-disable import/no-anonymous-default-export */
import path from "path";

export default ({ command, mode }) => {
    const isProd = mode === "production";

    return {
        build: {
            lib: {
                entry: path.resolve(__dirname, "src/index.ts"),
                formats: ["es", "cjs"],
                fileName: "main",
                name: "NetlessAppDocsViewer",
            },
            outDir: "dist",
            rollupOptions: {
                external: ["@netless/window-manager"],
            },
            minify: isProd,
        },
    };
};
