import type { NetlessApp } from "@netless/window-manager";
import type { NetlessAppMonacoAttributes } from "./typings";

import monacoLoader from "@monaco-editor/loader";

import { kind } from "./constants";
import { MonacoEditor } from "./MonacoEditor";

import editorStyles from "monaco-editor/min/vs/editor/editor.main.css?inline";
import styles from "./style.scss?inline";

export type { NetlessAppMonacoAttributes };

export type NetlessAppMonacoAppOptions = {
  loader?: Parameters<typeof monacoLoader.config>[0];
};

const NetlessAppMonaco: NetlessApp<NetlessAppMonacoAttributes> = {
  kind,
  config: {
    enableShadowDOM: false,
  },
  async setup(context) {
    const box = context.box;

    context.storage.ensureState({
      lang: "javascript",
      terminal: "",
      codeRunning: false,
    });

    box.mountStyles(styles + editorStyles);

    const appOptions = context.getAppOptions();

    if (appOptions) {
      if (appOptions.loader) {
        monacoLoader.config(appOptions.loader);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeRequire = (window as any).require;

    const monaco = await monacoLoader.init();

    // Restore global require if exist.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).require && nodeRequire) (window as any).require = nodeRequire;

    const monacoEditor = new MonacoEditor(context, box, monaco, !context.isWritable);

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).monacoEditor = monacoEditor;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).monacoContext = context;
    }

    context.emitter.on("writableChange", isWritable => {
      monacoEditor.setReadonly(!isWritable);
    });

    context.emitter.on("destroy", () => {
      monacoEditor.destroy();
    });

    return monacoEditor;
  },
};

export default NetlessAppMonaco;
