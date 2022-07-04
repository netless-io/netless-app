import styles from "./style.scss?inline";
import editorStyles from "monaco-editor/min/vs/editor/editor.main.css?inline";

import monacoLoader from "@monaco-editor/loader";
import type { NetlessApp } from "@netless/window-manager";
import { ensureAttributes } from "@netless/app-shared";
import type { NetlessAppMonacoAttributes } from "./typings";
import { NetlessAppMonacoPersistence } from "./monaco-persistence";
import { kind } from "./constants";
import { MonacoEditor } from "./MonacoEditor";

export type { NetlessAppMonacoAttributes } from "./typings";

export type NetlessAppMonacoAppOptions = {
  loader?: Parameters<typeof monacoLoader.config>[0];
};

const NetlessAppMonaco: NetlessApp<NetlessAppMonacoAttributes> = {
  kind,
  async setup(context) {
    const box = context.box;

    const attrs = ensureAttributes(context, {
      text: "",
      cursors: {},
      selections: {},
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

    const monacoEditor = new MonacoEditor(context, attrs, box, monaco, !context.isWritable);

    const persistence = new NetlessAppMonacoPersistence(
      context,
      attrs,
      monacoEditor.yDoc,
      monacoEditor.yText
    );

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
      persistence.destroy();
      monacoEditor.destroy();
    });

    return monacoEditor;
  },
};

export default NetlessAppMonaco;
