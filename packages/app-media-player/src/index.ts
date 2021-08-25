import type { NetlessApp } from "@netless/window-manager";
import Slider from "./slider.svelte";

interface Attributes {
  volume: number;
}

const MediaPlayer: NetlessApp<Attributes> = {
  kind: "MediaPlayer",
  setup(context) {
    let attrs: Attributes | undefined = {
      volume: 100,
      ...context.getAttributes(),
    };

    let box = context.getBox();
    let app = new Slider({
      target: box.$content!,
      props: { ...attrs },
    });

    app.$on("update:attrs", ({ detail }) => {
      attrs = context.getAttributes();
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
