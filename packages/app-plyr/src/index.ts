import type { NetlessApp } from "@netless/window-manager";
import Player from "./player.svelte";
import { Sync } from "./sync";
import styles from "./style.scss?inline";
import { Controller, PlayTimeState } from "./controller";

export { Controller, CustomPlyrControls } from "./controller";
export type { PlayTimeState } from "./controller";

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
  iconUrl?: string;
  /** 播放时间状态 */
  playTimeState?: PlayTimeState;
  /** 是否使用新的同步plyr逻辑 */
  useNewPlayer: boolean;
  /** 是否使用自定义播控组件, 默认使用自定义播控页 */
  useCustomControls?: boolean;
  /** 是否同步音量数据，默认同步 */
  syncVolume?: boolean;
  /** 是否同步静音数据，默认同步 */
  syncMuted?: boolean;
  /** 自定义播控组件标题 */
  customControlsTitle?: string;
  /** 是否允许后台播放，默认允许 */
  allowBackgroundPlayback?: boolean;
  /** 是否保持播放器内部状态同步，默认保持同步 */
  keepPlayerStateInSync?: boolean;
}

export interface AppResult {
  controller?: Controller;
}

const DefaultAttributes: Pick<
  Attributes,
  "volume" | "paused" | "muted" | "currentTime" | "useNewPlayer" | "syncVolume" | "syncMuted" | "useCustomControls" | "allowBackgroundPlayback" | "keepPlayerStateInSync"
> = {
  volume: 1,
  paused: true,
  muted: false,
  currentTime: 0,
  useNewPlayer: true,
  syncVolume: true,
  syncMuted: true,
  useCustomControls: true,
  allowBackgroundPlayback: true,
  keepPlayerStateInSync: true,
};

const Plyr: NetlessApp<Attributes, any, any, AppResult> = {
  kind: "Plyr",
  config: {
    minwidth: 300,
    minheight: 80,
  },
  setup(context) {
    const storage = context.storage;
    if (context.getIsWritable()) {
      storage.ensureState(DefaultAttributes);
    }
    const logger = (context.getDisplayer() as any).logger;

    if (!storage.state.src) {
      context.emitter.emit("destroy", {
        error: new Error(`[Plyr]: missing "src"`),
      });
      logger.error(`[Plyr]: missing "src"`);
      return {};
    }
    
    if (!storage.state.type && !storage.state.provider) {
      console.warn(`[Plyr]: missing "type", will guess from file extension`);
      logger.warn(`[Plyr]: missing "type", will guess from file extension`);
    }

    logger.info(`[Plyr]: appid ${context.appId} setup, storage state: ${JSON.stringify(storage.state)}`);

    const box = context.getBox();

    box.mountStyles(styles);

    if (storage.state.useNewPlayer) {
      const controller = new Controller(context, logger);
      box.$content.appendChild(controller.playerContainer);
      controller.mountPlayer();
      context.emitter.on("destroy", async () => {
        await controller.destroy();
        logger && logger.info(`[Plyr]: appid ${context.appId} destroy`);
      });
      return {
        controller,
      };
    }

    // old player logic
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
