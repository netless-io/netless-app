import type { NetlessApp } from "@netless/window-manager";
import Player from "./player.svelte";
import { Sync } from "./sync";
import styles from "./style.scss?inline";
import { Controller, PlayTimeState } from "./controller";
import type { YouTubeOverlayLayout } from "./youtube-overlay";
import type { YouTubePlaybackTarget } from "./youtube-playback-sync";
import { createPlyrLogger } from "./logger";

export { Controller, CustomPlyrControls } from "./controller";
export type { PlayTimeState } from "./controller";
export type { YouTubeOverlayLayout } from "./youtube-overlay";
export type { YouTubePlaybackTarget } from "./youtube-playback-sync";

export interface AppOptions {
  /** Local geometry calibrated for a supported YouTube layout. */
  youtubeOverlayLayout?: YouTubeOverlayLayout;
}

export interface Attributes {
  /** can only set once */
  src: string;
  /** can only set once */
  type: string;
  /** can only set once */
  poster: string;
  volume: number;
  /** 是否暂停播放，默认暂停 */
  paused: boolean;
  /** 是否静音，默认不静音 */
  muted: boolean;
  currentTime: number;
  hostTime: number;
  provider?: "youtube" | "vimeo";
  /** owner: native controls stay open; only the writable creator publishes transport. */
  youtubeInteractionMode?: "legacy" | "overlay" | "owner";
  /** Stable creation-time identity, independent of the current connection. */
  youtubeOwnerUid?: string;
  /** Atomic, versioned playback target used in owner mode. */
  youtubePlayback?: YouTubePlaybackTarget;
  owner?: string;
  iconUrl?: string;
  /** 播放时间状态 */
  playTimeState?: PlayTimeState;
  /** 是否使用新的同步plyr逻辑 */
  useNewPlayer: boolean;
  /** 是否使用自定义播控组件, 默认使用自定义播控页 */
  useCustomControls?: boolean;
  /** 是否同步音量及静音，默认不同步 */
  syncVolume?: boolean;
  /** 单独同步静音；syncVolume 开启时静音也同步，默认不同步 */
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
  syncVolume: false,
  syncMuted: false,
  useCustomControls: true,
  allowBackgroundPlayback: true,
  keepPlayerStateInSync: true,
};

const Plyr: NetlessApp<Attributes, any, AppOptions, AppResult> = {
  kind: "Plyr",
  config: {
    minwidth: 300,
    minheight: 80,
  },
  setup(context) {
    const storage = context.storage;
    if (context.getIsWritable()) {
      storage.ensureState(DefaultAttributes);
      if (storage.state.provider === "youtube" && storage.state.youtubeInteractionMode === "owner" && context.isAddApp) {
        const room = context.getRoom();
        if (room) {
          const now = room.calibrationTimestamp;
          storage.ensureState({
            youtubeOwnerUid: room.uid,
            youtubePlayback: { id: `${room.observerId}:initial`, author: room.uid, source: "command",
              state: storage.state.playTimeState || (storage.state.paused ? [true, now, now] : [false, now]), rate: 1 },
          });
        }
      }
    }
    const logger = createPlyrLogger(context);

    if (!storage.state.src) {
      context.emitter.emit("destroy", {
        error: new Error(`[Plyr]: missing "src"`),
      });
      logger.error(`[Plyr]: missing "src"`);
      return {};
    }
    
    if (!storage.state.type && !storage.state.provider) {
      logger.warn(`[Plyr]: missing "type", will guess from file extension`);
    }

    logger.info(`[Plyr]: appid ${context.appId} setup, storage state: ${JSON.stringify(storage.state)}`);

    const box = context.getBox();

    box.mountStyles(styles);

    if (storage.state.useNewPlayer) {
      const controller = new Controller(context, logger, context.getAppOptions()?.youtubeOverlayLayout);
      box.$content.appendChild(controller.playerContainer);
      controller.mountPlayer();
      context.emitter.on("destroy", async () => {
        await controller.destroy();
        logger.info(`[Plyr]: appid ${context.appId} destroy`);
      });
      return {
        controller,
      };
    }

    // old player logic
    const sync = new Sync(context, logger);
    const app = new Player({
      target: box.$content,
      props: { storage: context.storage, sync, logger },
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
        logger.warn("[Plyr] destroy failed", err);
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__pcmProxy) {
      let currentApp = app;
      const handleVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          logger.info("[Plyr] destroy app for pcm proxy.");
          while (box.$content.firstChild) {
            box.$content.removeChild(box.$content.firstChild);
          }
          currentApp.$destroy();
        } else {
          logger.info("[Plyr] recreate app for pcm proxy.");
          currentApp = new Player({
            target: box.$content,
            props: { storage: context.storage, sync, logger },
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
