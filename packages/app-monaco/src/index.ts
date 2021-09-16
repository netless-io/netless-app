import styles from "./style.scss?inline";
import editorStyles from "monaco-editor/min/vs/editor/editor.main.css?inline";

import type { NetlessApp } from "@netless/window-manager";
import { Doc } from "yjs";
import { editor as monacoEditor } from "monaco-editor";
import type { NetlessAppMonacoAttributes } from "./typings";
import { NetlessAppMonacoPersistence } from "./monaco-persistence";
import { YMonaco } from "./y-monaco";
import { kind } from "./constants";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker&inline";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker&inline";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker&inline";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker&inline";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline";

declare global {
  interface Window {
    MonacoEnvironment: {
      getWorker: (_: string, label: string) => Worker;
    };
  }
}

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string): Worker {
    switch (label) {
      case "javascript":
      case "typescript": {
        return new tsWorker();
      }
      case "json": {
        return new jsonWorker();
      }
      case "css":
      case "scss":
      case "less": {
        return new cssWorker();
      }
      case "html":
      case "handlebars":
      case "razor": {
        return new htmlWorker();
      }
      default: {
        return new editorWorker();
      }
    }
  },
};

export type { NetlessAppMonacoAttributes } from "./typings";

const NetlessAppMonaco: NetlessApp<NetlessAppMonacoAttributes> = {
  kind,
  setup(context) {
    const box = context.getBox();

    let attrs = context.getAttributes();
    if (!attrs) {
      context.setAttributes({ text: "", cursors: {}, selections: {} });
      attrs = context.getAttributes();
    }
    if (!attrs) {
      throw new Error("[NetlessAppMonaco] No attributes");
    }
    if (attrs.text == null) {
      context.updateAttributes(["text"], "");
    }
    if (!attrs.cursors) {
      context.updateAttributes(["cursors"], {});
    }
    if (!attrs.selections) {
      context.updateAttributes(["selections"], {});
    }

    box.mountStyles(styles + editorStyles);

    const yDoc = new Doc();
    const provider = new NetlessAppMonacoPersistence(context, attrs, yDoc);

    const readonly = !context.getIsWritable();

    const editor = monacoEditor.create(box.$content as HTMLElement, {
      value: "",
      automaticLayout: true,
      readOnly: readonly,
      language: "javascript",
      fixedOverflowWidgets: false,
    });

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).monacoEditor = editor;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).monacoContext = context;
    }

    const monacoBinding = new YMonaco(
      context,
      attrs,
      box,
      editor,
      provider.doc,
      provider.yText,
      readonly
    );

    updateReadonly(readonly);

    context.emitter.on("writableChange", isWritable => {
      updateReadonly(!isWritable);
    });

    context.emitter.on("destroy", () => {
      provider.destroy();
      monacoBinding.destroy();
      editor.dispose();
    });

    function updateReadonly(readonly: boolean): void {
      box.$content?.classList.toggle("netless-app-monaco-cursor-readonly", readonly);
      editor.updateOptions({ readOnly: readonly });
      monacoBinding.setReadonly(readonly);
    }

    return editor;
  },
};

export default NetlessAppMonaco;
