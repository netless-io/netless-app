import type { NetlessApp } from "@netless/window-manager";
import Slider from "./slider.svelte";
import styles from "plyr/dist/plyr.css?inline";

export interface Attributes {
  volume: number;
}

const MediaPlayer: NetlessApp<Attributes> = {
  kind: "MediaPlayer",
  setup(context) {
    let box = context.getBox();
    box.mountStyles(styles);

    let app = new Slider({
      target: box.$content!,
      props: context.getAttributes(),
    });

    app.$on("update:attrs", ({ detail }) => {
      let attrs = context.getAttributes();
      if (attrs?.volume !== detail.volume) {
        context.updateAttributes(["volume"], detail.volume);
      }
    });

    context.emitter.on("attributesUpdate", (other) => {
      app.$set(other);
    });

    if (import.meta.env.DEV) {
      ((window as any).players ||= []).push(app);
    }
  },
};

export default MediaPlayer;
