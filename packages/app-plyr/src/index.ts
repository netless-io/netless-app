import type { NetlessApp } from "@netless/window-manager";
import Player from "./player.svelte";
import { Sync } from "./sync";
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
  owner?: string;
}

export const DefaultAttributes: Pick<Attributes, "volume" | "paused" | "muted" | "currentTime"> = {
  volume: 1,
  paused: true,
  muted: false,
  currentTime: 0,
};

const Plyr: NetlessApp<Attributes> = {
  kind: "Plyr",
  config: {
    minwidth: 300,
    minheight: 80,
  },
  setup(context) {
    // user input
    const attributes = context.storage.state;

    // synced state
    const storage = context.createStorage<Attributes>("player", {
      ...DefaultAttributes,
      ...attributes,
    });

    if (!storage.state.src) {
      context.emitter.emit("destroy", {
        error: new Error(`[Plyr]: missing "src"`),
      });
      return;
    }

    if (!storage.state.type && !storage.state.provider) {
      console.warn(`[Plyr]: missing "type", will guess from file extension`);
    }

    const box = context.box;
    const container = document.createElement("div");
    container.className = "netless-app-plyr-container";

    box.mountStyles(styles);
    box.mountContent(container);

    const dispose = context.emitter.on("writableChange", () => {
      container.classList.toggle("is-readonly", !context.isWritable);
    });

    const sync = new Sync(context, storage);
    const app = new Player({
      target: container,
      props: { storage, sync },
    });

    // sync.behavior = "ideal";

    if (import.meta.env.DEV) {
      Object.assign(window, {
        media_player: { sync, app },
      });
    }

    context.emitter.on("destroy", () => {
      try {
        dispose();
        sync.dispose();
        app.$destroy();
      } catch (err) {
        // ignore
        // console.warn("[Plyr] destroy failed", err);
      }
    });
  },
};

export default Plyr;
