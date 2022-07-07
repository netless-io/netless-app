import type { NetlessApp, WhiteBoardView } from "@netless/window-manager";

const Whiteboard: NetlessApp<void, void, void, WhiteBoardView> = {
  kind: "Whiteboard",
  setup(context) {
    context.box.mountStage(document.createElement("div"));

    const view = context.createWhiteBoardView();
    if (context.isAddApp) {
      view.setBaseRect({ width: 1280, height: 720 });
    }

    return view;
  },
};

export default Whiteboard;
