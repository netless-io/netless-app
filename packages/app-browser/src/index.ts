import type { NetlessApp } from "@netless/window-manager";
import App from "./browser.svelte";
import styles from "./style.scss?inline";

export interface Attributes {
  url: string;
}

const Browser: NetlessApp<Attributes> = {
  kind: "Browser",
  setup(context) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const box = context.getBox()!;
    box.mountStyles(styles);

    let url = context.getAttributes()?.url || "about:blank";

    const app = new App<Attributes, { update: CustomEvent<string> }>({
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      target: box.$content!,
      props: { url },
    });

    app.$on("update", ({ detail: url }) => {
      context.updateAttributes(["url"], url);
    });

    context.emitter.on("attributesUpdate", attrs => {
      if (!context.getIsWritable()) {
        return app.$set({ url });
      }
      if (attrs?.url != null) {
        url = attrs.url;
        app.$set({ url });
      }
    });
  },
};

export default Browser;
