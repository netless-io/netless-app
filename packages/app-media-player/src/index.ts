import type { NetlessApp, Player as RePlayer } from "@netless/window-manager";
import Player from "./player.svelte";
import styles from "./style.scss?inline";

export interface Attributes {
  /** can only set once */
  src: string;
  /** can only set once */
  type: string;
  /** can only set once */
  poster: string;

  volume: number;
  paused: boolean;
  muted: boolean;
  currentTime: number;
  hostTime: number;
}

const defaultAttributes: Pick<Attributes, "volume" | "paused" | "muted" | "currentTime"> = {
  volume: 1,
  paused: true,
  muted: false,
  currentTime: 0,
};

const MediaPlayer: NetlessApp<Attributes> = {
  kind: "MediaPlayer",
  config: {
    minwidth: 300,
    minheight: 80,
  },
  setup(context) {
    const initialAttributes = { ...defaultAttributes, ...context.getAttributes() };

    if (!initialAttributes?.src) {
      context.emitter.emit("destroy", {
        error: new Error(`[MediaPlayer]: missing "src"`),
      });
      return;
    }

    if (!initialAttributes.type) {
      console.warn(`[MediaPlayer]: missing "type", will guess from file extension`);
    }

    const box = context.getBox();

    if (!box.$content) {
      context.emitter.emit("destroy", {
        error: new Error(`[MediaPlayer]: missing container (box.$content not exist)`),
      });
      return;
    }

    const room = context.getRoom();
    const player = room ? undefined : (context.getDisplayer() as RePlayer);

    box.mountStyles(styles);

    const getTimestamp = () => {
      if (room) return room.calibrationTimestamp;
      if (player) return player.beginTimestamp + player.progressTime;
    };

    const getCurrentTime = () => {
      const attrs = context.getAttributes();
      if (!attrs) return 0;
      const { paused, currentTime, hostTime } = attrs;
      if (paused) return currentTime;
      const now = getTimestamp();
      if (now && hostTime) {
        return currentTime + (now - hostTime) / 1000;
      } else {
        return currentTime;
      }
    };

    const initialProps: Partial<Attributes> = { ...initialAttributes };
    delete initialProps.hostTime;
    initialProps.currentTime = getCurrentTime();

    const app = new Player({
      target: box.$content,
      props: initialProps,
    });

    let saved = { ...initialAttributes };
    app.$on("update:attrs", ({ detail }) => {
      if (!context.getIsWritable()) {
        return app.$set(saved);
      }
      const attrs = context.getAttributes();
      console.log("→", detail);
      if ("volume" in detail && attrs?.volume !== detail.volume) {
        context.updateAttributes(["volume"], detail.volume);
      }
      if ("muted" in detail && attrs?.muted !== detail.muted) {
        context.updateAttributes(["muted"], detail.muted);
      }
      if ("paused" in detail && attrs?.paused !== detail.paused) {
        context.updateAttributes(["paused"], detail.paused);
      }
      if ("currentTime" in detail && attrs?.currentTime !== detail.currentTime) {
        context.updateAttributes(["hostTime"], getTimestamp());
        context.updateAttributes(["currentTime"], detail.currentTime);
      }
      saved = { ...saved, ...detail };
    });

    context.emitter.on("attributesUpdate", other => {
      app.$set(other);
    });

    context.emitter.on("destroy", () => {
      app.$destroy();
    });
  },
};

export default MediaPlayer;
