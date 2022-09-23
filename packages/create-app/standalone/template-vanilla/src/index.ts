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
    let box = context.box;
    box.mountStyles(styles);

    const storage = context.createStorage("state", {
      count: context.attributes.count || 0,
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
      if (context.isWritable) {
        storage.setState({ count: storage.state.count + 1 });
      }
    });
    content.appendChild(incButton);

    let decButton = document.createElement("button");
    decButton.textContent = "--";
    decButton.addEventListener("click", () => {
      if (context.isWritable) {
        storage.setState({ count: storage.state.count - 1 });
      }
    });
    content.appendChild(decButton);

    refresh();

    const dispose = storage.on("stateChanged", refresh);

    context.emitter.on("destroy", () => {
      dispose();
    });
  },
};

export default Demo;
