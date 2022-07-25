/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NetlessApp } from "@netless/window-manager";
import katex from "katex";
import { QuillEditor } from "./QuillEditor";

export interface NetlessAppQuillAttributes {}

const Quill: NetlessApp<NetlessAppQuillAttributes> = {
  kind: "Quill",
  config: {
    enableShadowDOM: false,
  },
  setup(context) {
    // quill need this
    if (!(window as any).katex) {
      (window as any).katex = katex;
    }

    const editor = new QuillEditor(context);

    if (import.meta.env.DEV) {
      (window as any).quill = editor;
    }

    context.emitter.on("destroy", () => {
      editor.destroy();
    });

    return editor;
  },
};

export default Quill;
