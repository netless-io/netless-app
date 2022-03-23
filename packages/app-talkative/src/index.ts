import type { NetlessApp } from "@netless/window-manager";
import { Logger } from "@netless/app-shared";
import { SideEffectManager } from "side-effect-manager";
import { appendQuery, getUserPayload, nextTick } from "./utils";
import { Renderer } from "./renderer";
import { Footer } from "./footer";

export interface TalkativeAttributes {
  /** (required) courseware url */
  src: string;
  /** teacher's uid */
  uid: string;
  /** current page */
  page: number;
  pageNum: number;
  /** sync to new users */
  lastMsg: string;
}

export interface MagixEventPayloads {
  broadcast: string;
}

export interface TalkativeOptions {
  debug?: boolean;
}

const Talkative: NetlessApp<TalkativeAttributes, MagixEventPayloads, TalkativeOptions> = {
  kind: "Talkative",
  setup(context) {
    context.storage.ensureState({
      src: "https://example.org",
      uid: "",
      page: 1,
      pageNum: 1,
      lastMsg: "",
    });

    const debug = (context.getAppOptions() || {}).debug;
    const logger = new Logger("Talkative", debug);
    const { uid, memberId, nickName } = getUserPayload(context);
    const sideEffect = new SideEffectManager();

    logger.log("my uid", uid);

    const onPrevPage = () => {
      if (context.getIsWritable() && context.storage.state.page > 1) {
        context.storage.setState({ page: context.storage.state.page - 1 });
      }
    };

    const onNextPage = () => {
      if (context.getIsWritable() && context.storage.state.page < context.storage.state.pageNum) {
        context.storage.setState({ page: context.storage.state.page + 1 });
      }
    };

    const renderer = new Renderer(context);
    const footer = new Footer(context, onPrevPage, onNextPage);

    sideEffect.addDisposer(
      context.storage.addStateChangedListener(() => {
        const role = context.storage.state.uid === uid ? 0 : 2;
        renderer.role.set(role);
        footer.role.set(role);
      })
    );

    const on_ready = () => {
      sideEffect.addDisposer(renderer.mount());
      sideEffect.addDisposer(footer.mount());

      const role = context.storage.state.uid === uid ? 0 : 2;
      const query = `userid=${memberId}&role=${role}&name=${nickName}`;
      renderer.$iframe.src = appendQuery(context.storage.state.src, query);
    };

    if (!context.storage.state.uid) {
      const disposerID = sideEffect.addDisposer(
        context.storage.addStateChangedListener(() => {
          if (context.storage.state.uid) {
            sideEffect.flush(disposerID);
            on_ready();
          }
        })
      );

      if (context.isAddApp) {
        logger.log("no teacher's uid, setting myself...");
        context.storage.setState({ uid });
      }
    } else {
      nextTick.then(on_ready);
    }

    sideEffect.addDisposer(
      context.storage.addStateChangedListener(() => {
        const { page, pageNum } = context.storage.state;
        footer.text.set(`${page}/${pageNum}`);
        renderer.postMessage(JSON.stringify({ method: "onJumpPage", toPage: page }));
      })
    );

    const handlers = {
      onPagenum({ totalPages }: { totalPages: number }) {
        if (context.getIsWritable() && totalPages) {
          context.storage.setState({ pageNum: totalPages });
        }
      },

      onLoadComplete(data: { totalPages?: number; coursewareRatio: number }) {
        renderer.ratio.set(data.coursewareRatio);

        if (context.getIsWritable() && data.totalPages) {
          context.storage.setState({ pageNum: data.totalPages });
        }

        // send last message to sync state
        const { page, lastMsg } = context.storage.state;
        lastMsg && renderer.postMessage(lastMsg);

        // send first page jump message
        renderer.postMessage(JSON.stringify({ method: "onJumpPage", toPage: page }));
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
        renderer.postMessage(payload);
      })
    );

    sideEffect.addEventListener(window, "message", ev => {
      if (ev.source !== renderer.$iframe.contentWindow) return;
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

    context.emitter.on("destroy", () => {
      logger.log("destroy");
      sideEffect.flushAll();
    });
  },
};

export default Talkative;
