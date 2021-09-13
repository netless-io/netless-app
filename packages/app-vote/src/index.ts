import type { NetlessApp } from "@netless/window-manager";
import App from "./vote.svelte";
import styles from "./style.scss?inline";

export interface Attributes {
  title: string;
  items: string[];
  [key: `item-${number}`]: number;
}

const Vote: NetlessApp<Attributes> = {
  kind: "Vote",
  setup(context) {
    const box = context.getBox();

    let attrs = context.getAttributes() as Attributes;
    if (!attrs) {
      context.setAttributes({ title: "", items: [] });
      attrs = context.getAttributes() as Attributes;
    }
    if (!attrs) {
      context.emitter.emit("destroy", {
        error: new Error(`[NetlessAppVote] No attributes`),
      });
      return;
    }
    if (attrs.title == null) {
      context.updateAttributes(["title"], "");
    }
    if (!attrs.items) {
      context.updateAttributes(["items"], []);
    }

    box.mountStyles(styles);

    interface Props {
      title?: string;
      items?: string[];
      votes?: number[];
      writable: boolean;
    }
    const app = new App<Props, { update: CustomEvent<Detail> }>({
      target: box.$content as HTMLDivElement,
      props: { writable: context.getIsWritable() },
    });

    context.emitter.on("writableChange", () => {
      app.$set({ writable: context.getIsWritable() });
    });

    type Detail = Partial<Pick<Attributes, "items" | "title"> & { votes: [i: number, n: number] }>;

    app.$on("update", ({ detail }: { detail: Detail }) => {
      if ("title" in detail) {
        context.updateAttributes(["title"], detail.title);
      }
      if ("items" in detail) {
        context.updateAttributes(["items"], detail.items);
      }
      if (Array.isArray(detail.votes)) {
        const [i, n] = detail.votes;
        context.updateAttributes([`item-${i}`], n);
      }
    });

    const disposers = [
      context.mobxUtils.autorun(() => {
        app.$set({ title: attrs.title });
      }),
      context.mobxUtils.autorun(() => {
        attrs.items && app.$set({ items: [...attrs.items] });
      }),
      context.mobxUtils.autorun(() => {
        attrs.items && app.$set({ votes: attrs.items.map((_, i) => attrs[`item-${i}`] || 0) });
      }),
    ];

    context.emitter.on("destroy", () => {
      disposers.forEach(f => f());
      app.$destroy();
    });
  },
};

export default Vote;
