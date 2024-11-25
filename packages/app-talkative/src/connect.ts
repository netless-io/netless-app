import type { Logger } from "@netless/app-shared";
import type { AppContext } from "@netless/window-manager";
import type { TalkativeAttributes, MagixEventPayloads } from "./index";
import { SideEffectManager } from "side-effect-manager";

export interface ConnectParams {
  context: AppContext<TalkativeAttributes, MagixEventPayloads>;
  logger: Logger;
  postMessage: (message: string) => void;
  onRatioChanged: (ratio: number) => void;
  isSentBySelf: (source: MessageEventSource | null) => boolean;
  onLocalMessage?: (appId: string, event: Record<string, unknown>) => void;
}

export function connect({ context, logger, ...callbacks }: ConnectParams): () => void {
  const sideEffect = new SideEffectManager();

  const handlers = {
    onPagenum({ totalPages }: { totalPages: number }) {
      if (context.getIsWritable() && totalPages) {
        context.storage.setState({ pageNum: totalPages });
      }
    },

    onLoadComplete(data: { totalPages?: number; coursewareRatio: number }) {
      callbacks.onRatioChanged(data.coursewareRatio);

      if (context.getIsWritable() && data.totalPages) {
        context.storage.setState({ pageNum: data.totalPages });
      }

      // send last message to sync state
      const { page, lastMsg } = context.storage.state;
      lastMsg && callbacks.postMessage(lastMsg);

      // send first page jump message
      callbacks.postMessage(JSON.stringify({ method: "onJumpPage", toPage: page }));
    },
    onLocalMessage(event: Record<string, unknown>) {
      if (context.getIsWritable()) {
        callbacks?.onLocalMessage && callbacks.onLocalMessage(context.appId, event);
      }
    },

    onFileMessage(event: Record<string, unknown>) {
      if (context.getIsWritable()) {
        context.dispatchMagixEvent("broadcast", JSON.stringify(event));

        // save last message
        const lastMsg = JSON.stringify({ ...event, isRestore: true });
        context.storage.setState({ lastMsg });
      }
    },
  };

  sideEffect.addDisposer(
    context.addMagixEventListener("broadcast", ({ payload }) => {
      callbacks.postMessage(payload);
    })
  );

  sideEffect.addEventListener(window, "message", ev => {
    if (!callbacks.isSentBySelf(ev.source)) return;
    if (typeof ev.data === "string") {
      try {
        const event = JSON.parse(ev.data);
        if (typeof event === "object" && event !== null) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const handler = (handlers as any)[event.method];
          if (handler) {
            handler(event);
          } else {
            logger.warn("unknown message", event);
          }
        }
      } catch (error) {
        logger.warn("error when parsing message", error);
      }
    } else if (typeof ev.data === "object" && ev.data !== null) {
      logger.log("unhandled permission command", ev.data);
    }
  });

  return sideEffect.flushAll.bind(sideEffect);
}
