import type { NetlessApp } from "@netless/window-manager";
import Player from "./player.svelte";
import { Sync } from "./sync";
import styles from "./style.scss?inline";
import { Controller, PlayTimeState } from "./controller";

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
  useNewPlayer: boolean;
  playTimeState?: PlayTimeState;

  provider?: "youtube" | "vimeo";
  owner?: string;
  iconUrl?: string;
}

export interface AppResult {
  controller?: Controller;
}

const DefaultAttributes: Pick<Attributes, "volume" | "paused" | "muted" | "currentTime" | "useNewPlayer"> = {
  volume: 1,
  paused: true,
  muted: false,
  currentTime: 0,
  useNewPlayer: false,
};

const Plyr: NetlessApp<Attributes, any, any, AppResult> = {
  kind: "Plyr",
  config: {
    minwidth: 300,
    minheight: 80,
  },
  setup(context) {
    const storage = context.storage;
    storage.ensureState(DefaultAttributes);

    if (!storage.state.src) {
      context.emitter.emit("destroy", {
        error: new Error(`[Plyr]: missing "src"`),
      });
      return {};
    }

    if (!storage.state.type && !storage.state.provider) {
      console.warn(`[Plyr]: missing "type", will guess from file extension`);
    }

    const box = context.getBox();

    box.mountStyles(styles);

    if (storage.state.useNewPlayer) {
      let controller = new Controller(context);
      box.$content.appendChild(controller.playerContainer);
      controller.mountPlayer().then(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).__pcmProxy) {
        let currentApp = controller;
        const handleVisibilityChange = () => {
          if (document.visibilityState === "hidden") {
            console.log("[Plyr] destroy app for pcm proxy.");
            while (box.$content.firstChild) {
              box.$content.removeChild(box.$content.firstChild);
            }
            currentApp.destroy();
          } else {
            console.log("[Plyr] recreate app for pcm proxy.");
            controller.mountPlayer();
          }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        context.emitter.on("destroy", () => {
          currentApp.destroy();
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        });
      } else {
        context.emitter.on("destroy", () => {
          controller.destroy();
        });
      }
      });
      return {
        controller
      };
    }

    const sync = new Sync(context);
    const app = new Player({
      target: box.$content,
      props: { storage: context.storage, sync },
    });

    // sync.behavior = "ideal";

    if (import.meta.env.DEV) {
      Object.assign(window, {
        media_player: { sync, app },
      });
    }

    context.emitter.on("destroy", () => {
      try {
        sync.dispose();
        app.$destroy();
      } catch (err) {
        // ignore
        // console.warn("[Plyr] destroy failed", err);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__pcmProxy) {
      let currentApp = app;
      const handleVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          console.log("[Plyr] destroy app for pcm proxy.");
          while (box.$content.firstChild) {
            box.$content.removeChild(box.$content.firstChild);
          }
          currentApp.$destroy();
        } else {
          console.log("[Plyr] recreate app for pcm proxy.");
          currentApp = new Player({
            target: box.$content,
            props: { storage: context.storage, sync },
          });
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      context.emitter.on("destroy", () => {
        currentApp.$destroy();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      });
    }
    return {};
  },
};

export default Plyr;
