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
    const box = context.box;

    const storage = context.createStorage<Attributes>("vote", { title: "", items: [] });

    box.setHighlightStage(false);
    box.mountStyles(styles);

    const app = new App({
      target: box.$content as HTMLDivElement,
      props: {
        writable: context.isWritable,
        title: storage.state.title,
        items: storage.state.items,
        votes: storage.state.items.map((_, i) => storage.state[`item-${i}`] || 0),
      },
    });

    const dispose_writable_listener = context.emitter.on("writableChange", () => {
      app.$set({ writable: context.isWritable });
    });

    type Detail = Partial<Pick<Attributes, "items" | "title"> & { votes: [i: number, n: number] }>;

    app.$on("update", ({ detail }: { detail: Detail }) => {
      if ("title" in detail) {
        storage.setState({ title: detail.title });
      }
      if ("items" in detail) {
        storage.setState({ items: detail.items });
      }
      if (Array.isArray(detail.votes)) {
        const [i, n] = detail.votes;
        storage.setState({ [`item-${i}`]: n });
      }
    });

    const dispose = storage.addStateChangedListener(diff => {
      console.log(storage.state);
      if (diff.title) {
        app.$set({ title: diff.title.newValue });
      } else {
        const votes = storage.state.items.map((_, i) => storage.state[`item-${i}`] || 0);
        app.$set({ items: storage.state.items, votes });
      }
    });

    context.emitter.on("destroy", () => {
      dispose_writable_listener();
      dispose();
      app.$destroy();
    });
  },
};

export default Vote;
