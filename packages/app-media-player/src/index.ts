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

  provider?: "youtube" | "vimeo";
}

const defaultAttributes: Pick<Attributes, "volume" | "paused" | "muted" | "currentTime"> = {
  volume: 1,
  paused: true,
  muted: false,
  currentTime: 87,
};

const MediaPlayer: NetlessApp<Attributes> = {
  kind: "MediaPlayer",
  config: {
    minwidth: 300,
    minheight: 80,
  },
  setup(context) {
    const storage = context.storage;
    storage.ensureState(defaultAttributes);

    if (!storage.state.src) {
      context.emitter.emit("destroy", {
        error: new Error(`[MediaPlayer]: missing "src"`),
      });
      return;
    }

    if (!storage.state.type) {
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
      const { paused, currentTime, hostTime } = storage.state;
      if (paused) return currentTime;
      const now = getTimestamp();
      if (now && hostTime) {
        return currentTime + (now - hostTime) / 1000;
      } else {
        return currentTime;
      }
    };

    const initialProps: Partial<Attributes> = { ...storage.state };
    delete initialProps.hostTime;
    initialProps.currentTime = getCurrentTime();

    const app = new Player({
      target: box.$content,
      props: initialProps as Omit<Attributes, "hostTime">,
    });

    let saved = { ...storage.state };
    app.$on("update:attrs", ({ detail }: CustomEvent<Attributes>) => {
      if (!context.getIsWritable()) {
        return app.$set(saved);
      }
      const attrs = storage.state;
      console.log("→", detail);
      if ("volume" in detail && attrs.volume !== detail.volume) {
        storage.setState({ volume: detail.volume });
      }
      if ("muted" in detail && attrs.muted !== detail.muted) {
        storage.setState({ muted: detail.muted });
      }
      if ("paused" in detail && attrs.paused !== detail.paused) {
        storage.setState({ paused: detail.paused });
      }
      if ("currentTime" in detail && attrs.currentTime !== detail.currentTime) {
        storage.setState({
          hostTime: getTimestamp(),
          currentTime: detail.currentTime,
        });
      }
      saved = { ...saved, ...detail };
    });

    const dispose = storage.addStateChangedListener(() => {
      app.$set(storage.state);
    });

    context.emitter.on("destroy", () => {
      dispose();
      app.$destroy();
    });
  },
};

export default MediaPlayer;
