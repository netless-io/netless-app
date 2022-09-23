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
    const attributes = context.attributes as Partial<TalkativeAttributes>;

    const storage = context.createStorage("talkative", {
      src: "https://example.org",
      uid: "",
      page: 1,
      pageNum: 1,
      lastMsg: "",
      ...attributes,
    });

    const debug = (context.getAppOptions() || {}).debug;
    const logger = new Logger("Talkative", debug);
    const { uid, memberId, nickName } = getUserPayload(context);
    const sideEffect = new SideEffectManager();

    logger.log("my uid", uid);

    const onPrevPage = () => {
      const { page } = storage.state;
      if (context.isWritable && page > 1) {
        storage.setState({ page: page - 1 });
      }
    };

    const onNextPage = () => {
      const { page, pageNum } = storage.state;
      if (context.isWritable && page < pageNum) {
        storage.setState({ page: page + 1 });
      }
    };

    const renderer = new Renderer(context);
    const footer = new Footer(context, onPrevPage, onNextPage);

    const postMessage = renderer.postMessage.bind(renderer);

    sideEffect.addDisposer(
      connect({
        context,
        storage,
        logger,
        postMessage,
        onRatioChanged: renderer.ratio.set.bind(renderer.ratio),
        isSentBySelf: source => source === renderer.$iframe.contentWindow,
      })
    );

    sideEffect.addDisposer(
      storage.on("stateChanged", () => {
        // update role
        const role = storage.state.uid === uid ? 0 : 2;
        renderer.role.set(role);
        footer.role.set(role);
        // update page
        const { page, pageNum } = storage.state;
        postMessage(JSON.stringify({ method: "onJumpPage", toPage: page }));
        footer.text.set(`${page}/${pageNum}`);
      })
    );

    const on_ready = () => {
      sideEffect.addDisposer(renderer.mount());
      sideEffect.addDisposer(footer.mount());

      const role = storage.state.uid === uid ? 0 : 2;
      const query = `userid=${memberId}&role=${role}&name=${nickName}`;
      renderer.$iframe.src = appendQuery(storage.state.src, query);

      renderer.role.set(role);
      footer.role.set(role);
      const { page, pageNum } = storage.state;
      footer.text.set(`${page}/${pageNum}`);
    };

    // if there's no uid, wait for it to exist
    if (!storage.state.uid) {
      const disposerID = sideEffect.addDisposer(
        storage.on("stateChanged", () => {
          if (storage.state.uid) {
            sideEffect.flush(disposerID);
            on_ready();
          }
        })
      );

      if (context.isAddApp) {
        logger.log("no teacher's uid, setting myself...");
        storage.setState({ uid });
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
