import type { NetlessApp } from "@netless/window-manager";
import { Logger } from "@netless/app-shared";
import { SideEffectManager } from "side-effect-manager";
import { appendQuery, getUserPayload, nextTick } from "./utils";
import { Renderer } from "./renderer";
import { Footer } from "./footer";
import { connect } from "./connect";

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
      const { page } = context.storage.state;
      if (context.isWritable && page > 1) {
        context.storage.setState({ page: page - 1 });
      }
    };

    const onNextPage = () => {
      const { page, pageNum } = context.storage.state;
      if (context.isWritable && page < pageNum) {
        context.storage.setState({ page: page + 1 });
      }
    };

    const renderer = new Renderer(context);
    const footer = new Footer(context, onPrevPage, onNextPage);

    const postMessage = renderer.postMessage.bind(renderer);

    sideEffect.addDisposer(
      connect({
        context,
        logger,
        postMessage,
        onRatioChanged: renderer.ratio.set.bind(renderer.ratio),
        isSentBySelf: source => source === renderer.$iframe.contentWindow,
      })
    );

    sideEffect.addDisposer(
      context.storage.addStateChangedListener(() => {
        // update role
        const role = context.storage.state.uid === uid ? 0 : 2;
        renderer.role.set(role);
        footer.role.set(role);
        // update page
        const { page, pageNum } = context.storage.state;
        postMessage(JSON.stringify({ method: "onJumpPage", toPage: page }));
        footer.text.set(`${page}/${pageNum}`);
      })
    );

    const on_ready = () => {
      sideEffect.addDisposer(renderer.mount());
      sideEffect.addDisposer(footer.mount());

      const role = context.storage.state.uid === uid ? 0 : 2;
      const query = `userid=${memberId}&role=${role}&name=${nickName}`;
      renderer.$iframe.src = appendQuery(context.storage.state.src, query);
    };

    // if there's no uid, wait for it to exist
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

    context.emitter.on("destroy", () => {
      logger.log("destroy");
      sideEffect.flushAll();
    });
  },
};

export default Talkative;
