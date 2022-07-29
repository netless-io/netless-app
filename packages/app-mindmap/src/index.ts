/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NetlessApp } from "@netless/window-manager";
import { MindMapEditor } from "./MindMap";

export interface MindMapNode {
  label: string;
  children?: MindMapNode[];
}

export interface NetlessAppMindMapAttributes {
  root?: MindMapNode;
}

const MindMap: NetlessApp<NetlessAppMindMapAttributes> = {
  kind: "MindMap",
  setup(context) {
    const editor = new MindMapEditor(context);

    if (import.meta.env.DEV) {
      (window as any).mindmap = editor;
    }

    context.emitter.on("destroy", () => {
      editor.destroy();
    });

    return editor;
  },
};

export default MindMap;
