import type { NetlessApp } from "@netless/window-manager";
import styles from "./style.css?inline";

export interface Attributes {
  count: number;
}

/**
 * @example
 * WindowManager.register({ kind: "Demo", src: Demo })
 *
 * manager.addApp({
 *   kind: "Demo",
 *   attributes: {
 *     count: 42
 *   }
 * })
 */
const Demo: NetlessApp<Attributes> = {
  kind: "Demo",
  setup(context) {
    let box = context.getBox();
    box.mountStyles(styles);

    const storage = context.createStorage("state", {
      count: context.getAttributes()?.count || 0,
    });

    let content = document.createElement("div");
    content.dataset.kind = "demo";
    box.mountContent(content);

    let text = document.createElement("p");
    const refresh = () => {
      text.textContent = String(storage.state.count);
    };

    let incButton = document.createElement("button");
    incButton.textContent = "++";
    incButton.addEventListener("click", () => {
      if (context.getIsWritable()) {
        storage.setState({ count: storage.state.count + 1 });
      }
    });
    content.appendChild(incButton);

    let decButton = document.createElement("button");
    decButton.textContent = "--";
    decButton.addEventListener("click", () => {
      if (context.getIsWritable()) {
        storage.setState({ count: storage.state.count - 1 });
      }
    });
    content.appendChild(decButton);

    refresh();

    storage.onStateChanged.addListener(refresh);

    context.emitter.on("destroy", () => {
      storage.onStateChanged.removeListener(refresh);
    });
  },
};

export default Demo;
