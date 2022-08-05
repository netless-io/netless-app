import type { NetlessApp } from "@netless/window-manager";

import { render } from "preact";
import { App } from "./components/App";
import styles from "./style.scss?inline";

const Gomoku: NetlessApp = {
  kind: "Gomoku",
  config: {
    minwidth: 0.3,
    minheight: 0.3,
    width: (9 / 16) * 0.5,
    height: 0.5,
  },
  setup(context) {
    context.box.mountStyles(styles);

    const $container = document.createElement("div");
    $container.className = "netless-app-gomoku-container";
    context.box.mountContent($container);

    render(<App context={context} />, $container);

    context.emitter.on("destroy", () => {
      render(null, $container);
    });
  },
};

export default Gomoku;
