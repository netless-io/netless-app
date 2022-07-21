import type { NetlessApp } from "@netless/window-manager";
import { QuillEditor } from "./QuillEditor";

export interface NetlessAppQuillAttributes {
  text?: string;
}

export interface NetlessAppQuillEvents {
  edit: string;
}

const Quill: NetlessApp<NetlessAppQuillAttributes, NetlessAppQuillEvents> = {
  kind: "Quill",
  config: {
    enableShadowDOM: false,
  },
  setup(context) {
    const editor = new QuillEditor(context);

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).quill = editor;
    }

    context.emitter.on("destroy", () => {
      editor.destroy();
    });

    return editor;
  },
};

export default Quill;
