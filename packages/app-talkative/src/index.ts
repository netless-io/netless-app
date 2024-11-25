import type { AnimationMode, NetlessApp } from "@netless/window-manager";
import { Logger } from "@netless/app-shared";
import { SideEffectManager } from "side-effect-manager";
import { appendQuery, getUserPayload, nextTick } from "./utils";
import { Renderer } from "./renderer";
import { Footer } from "./footer";
import { connect } from "./connect";
import { height } from "./hardcode";

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
  onLocalMessage?: (appId: string, event: Record<string, unknown>) => void;
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
    const ClickThroughAppliances = new Set(["clicker", "hand"]);

    // const debug = (context.getAppOptions() || {}).debug;
    const { onLocalMessage, debug } = (context.getAppOptions() || {}) as TalkativeOptions;
    const logger = new Logger("Talkative", debug);
    const { uid, userId, nickName } = getUserPayload(context);
    const sideEffect = new SideEffectManager();
    const view = context.getView();
    const room = context.getRoom();

    logger.log("my uid", uid);

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    let toggleClickThrough: (enable?: boolean) => void = () => {};
    const shouldClickThrough = (tool: string) => {
      return ClickThroughAppliances.has(tool);
    };
    const setPage = (page: unknown): void => {
      if (!view) {
        logger.warn("SetPage: page api is only available with 'scenePath' options enabled.");
      } else {
        const scenePath = context.getInitScenePath();
        if (typeof page === "string" && context.getIsWritable() && scenePath && room) {
          const fullScenePath = [scenePath, page].join("/");
          if (room.scenePathType(fullScenePath) === "none") {
            room.putScenes(scenePath, [{ name: page }]);
          }
          context.setScenePath(fullScenePath);
          context.updateAttributes(["page"], page);
        }
      }
    };
    const onPrevPage = () => {
      const { page } = context.storage.state;
      if (context.getIsWritable() && page > 1) {
        context.storage.setState({ page: page - 1 });
      }
    };

    const onNextPage = () => {
      const { page, pageNum } = context.storage.state;
      if (context.getIsWritable() && page < pageNum) {
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
        onLocalMessage,
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

    if (room) {
      sideEffect.add(() => {
        const onRoomStateChanged = (e: { memberState: { currentApplianceName: string } }) => {
          if (e.memberState) {
            toggleClickThrough(shouldClickThrough(e.memberState.currentApplianceName));
          }
        };
        room.callbacks.on("onRoomStateChanged", onRoomStateChanged);
        return () => room.callbacks.off("onRoomStateChanged", onRoomStateChanged);
      });
    }

    const on_ready = () => {
      sideEffect.addDisposer(renderer.mount());
      sideEffect.addDisposer(footer.mount());

      const role = context.storage.state.uid === uid ? 0 : 2;
      const query = `userid=${userId}&role=${role}&name=${nickName}`;
      renderer.$iframe.src = appendQuery(context.storage.state.src, query);

      renderer.role.set(role);
      footer.role.set(role);
      const { page, pageNum } = context.storage.state;
      footer.text.set(`${page}/${pageNum}`);
      setPage(`${page}`);
      if (view) {
        // 添加一个 viewBox，用于添加绘制白板
        const viewBox = document.createElement("div");
        Object.assign(viewBox.style, {
          width: "100%",
          height: "100%",
          position: "absolute",
          top: 0,
          left: 0,
          overflow: "hidden",
        });
        renderer.$content.appendChild(viewBox);
        context.mountView(viewBox);
        view.disableCameraTransform = true;
        sideEffect.add(() => {
          const onResize = () => {
            const clientRect = renderer.$content.getBoundingClientRect();
            const scale = clientRect.height / height;
            view.moveCamera({ scale, animationMode: "immediately" as AnimationMode });
          };
          const observer = new ResizeObserver(onResize);
          observer.observe(renderer.$content);
          return () => observer.disconnect();
        });

        toggleClickThrough = (enable?: boolean) => {
          viewBox.style.pointerEvents = enable ? "none" : "auto";
        };

        if (room?.state.memberState.currentApplianceName) {
          toggleClickThrough(shouldClickThrough(room?.state.memberState.currentApplianceName));
        }
      }
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
