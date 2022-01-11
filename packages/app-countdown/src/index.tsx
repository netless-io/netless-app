import type { NetlessApp } from "@netless/window-manager";
import { render } from "preact";
import styles from "./style.scss?inline";
import { App, type StorageState } from "./App";

const MIN_WIDTH = 208;
const MIN_HEIGHT = 216;

const Countdown: NetlessApp = {
  kind: "Countdown",
  config: {
    minwidth: MIN_WIDTH,
    minheight: MIN_HEIGHT,
  },
  setup(context) {
    const box = context.getBox();

    box.mountStyles(styles);

    const storage = context.createStorage<StorageState>("state", {
      countdownSecs: 0,
      startTime: 0,
      paused: false,
    });

    render(<App context={context} storage={storage} />, box.$content);

    context.emitter.on("destroy", () => {
      render(null, box.$content);
    });
  },
};

export default Countdown;
