import styles from "./style.scss?inline";

import type { NetlessApp } from "@netless/window-manager";
import { Doc } from "yjs";
import { editor as monacoEditor } from "monaco-editor";
import type { NetlessAppMonacoAttributes } from "./typings";
import { NetlessAppMonacoPersistence } from "./monaco-persistence";
import { YMonaco } from "./y-monaco";
import { kind } from "./constants";

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

    box.mountStyles(styles);

    const yDoc = new Doc();
    const provider = new NetlessAppMonacoPersistence(context, attrs, yDoc);

    const readonly = !context.getIsWritable();

    const editor = monacoEditor.create(box.$content as HTMLElement, {
      value: "",
      automaticLayout: true,
      readOnly: readonly,
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
  },
};

export default NetlessAppMonaco;
