import styles from "./style.scss?inline";

import type { NetlessApp } from "@netless/window-manager";
import { Doc } from "yjs";
import { MonacoBinding } from "y-monaco";
import { editor as monacoEditor } from "monaco-editor";
import type { NetlessAppMonacoAttributes } from "./typings";
import { NetlessAppAttributesProvider } from "./y-app-attributes";

export type { NetlessAppMonacoAttributes } from "./typings";

const NetlessAppMonaco: NetlessApp<NetlessAppMonacoAttributes> = {
  kind: "Monaco",
  setup(context) {
    const box = context.getBox();

    let attrs = context.getAttributes();
    if (!attrs) {
      context.setAttributes({});
      attrs = context.getAttributes();
    }
    if (!attrs) {
      throw new Error("[NetlessAppMonaco] No attributes");
    }

    box.mountStyles(styles);

    const yDoc = new Doc();
    const provider = new NetlessAppAttributesProvider(context, attrs, yDoc);

    const editor = monacoEditor.create(box.$content as HTMLElement, {
      value: "",
      automaticLayout: true,
    });

    const monacoBinding = new MonacoBinding(
      provider.yText,
      editor.getModel(),
      new Set([editor]),
      provider.awareness
    );

    context.emitter.on("destroy", () => {
      provider.destroy();
      monacoBinding.destroy();
    });
  },
};

export default NetlessAppMonaco;
