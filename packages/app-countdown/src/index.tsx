import type { NetlessApp } from "@netless/window-manager";
import { render } from "preact";
import FlipCountDown from "./FlipCountDown";
import styles from "./style.scss?inline";

export interface Attributes {
  state: {
    // 开始时间戳，0 表示没开始，当此项存在时，已经经过的时间 = 本地时间戳 - start
    start: number;
    // 暂停时间戳，0 表示没暂停，当此项存在时，已经经过的时间 = pause - start
    pause: number;
    // 倒计时 (秒数)，0 表示正向，当此项存在时，显示 top - 已经经过的时间
    total: number;
  };
}

const Noop = () => null;

const Countdown: NetlessApp<Attributes> = {
  kind: "Countdown",
  config: {
    minwidth: 208,
    minheight: 180,
  },
  setup(context) {
    let attrs = context.getAttributes();
    if (!attrs?.state) {
      context.setAttributes({ state: { start: 0, pause: 0, total: 0 } });
      attrs = context.getAttributes();
    }
    if (!attrs) {
      throw new Error("[Countdown]: No attributes");
    }

    const room = context.getRoom();
    if (!room) {
      throw new Error("[Countdown]: No room");
    }

    const box = context.getBox();
    const container = document.createElement("div");
    container.classList.add("netless-app-flipdown-container");

    box.mountStyles(styles);
    box.mountContent(container);

    render(<FlipCountDown context={context} room={room} />, container);

    context.emitter.on("destroy", () => {
      console.log("[Countdown]: destroy");
      render(<Noop />, container);
      container.remove();
    });
  },
};

export default Countdown;
