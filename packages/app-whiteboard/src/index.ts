import type { NetlessApp, WhiteBoardView } from "@netless/window-manager";

const Whiteboard: NetlessApp<void, void, void, WhiteBoardView> = {
  kind: "Whiteboard",
  setup(context) {
    context.box.mountStage(document.createElement("div"));
    return context.createWhiteBoardView();
  },
};

export default Whiteboard;
