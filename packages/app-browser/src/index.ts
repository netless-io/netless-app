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
    let attrs = context.getAttributes() as Attributes;
    if (!attrs?.url) {
      context.setAttributes({ url: "about:blank" });
      attrs = context.getAttributes() as Attributes;
    }
    if (!attrs) {
      throw new Error("[Browser]: Missing attributes");
    }

    const box = context.getBox();
    box.mountStyles(styles);

    const app = new App({
      target: box.$content as HTMLElement,
      props: { url: attrs.url },
    });

    app.$on("update", ({ detail: url }) => {
      context.updateAttributes(["url"], url);
    });

    context.mobxUtils.autorun(() => {
      app.$set({ url: attrs.url, dummyURL: attrs.url });
    });

    context.emitter.on("destroy", () => {
      console.log("[Browser]: destroy");
      app.$destroy();
    });
  },
};

export default Browser;
