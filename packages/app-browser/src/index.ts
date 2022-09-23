import type { NetlessApp } from "@netless/window-manager";
import App from "./browser.svelte";
import styles from "./style.scss?inline";

export interface Attributes {
  url: string;
  dummyURL?: string;
}

const Browser: NetlessApp<Attributes> = {
  kind: "Browser",
  setup(context) {
    const storage = context.createStorage("browser", context.attributes);

    const box = context.box;
    box.mountStyles(styles);

    const app = new App({
      target: box.$content as HTMLElement,
      props: { url: storage.state.url || "about:blank" },
    });

    app.$on("update", ({ detail: url }) => {
      storage.setState({ url });
    });

    const disposeListener = storage.on("stateChanged", () => {
      const { url } = storage.state;
      app.$set({ url: url, dummyURL: url });
    });

    context.emitter.on("destroy", () => {
      console.log("[Browser]: destroy");
      disposeListener();
      app.$destroy();
    });
  },
};

export default Browser;
