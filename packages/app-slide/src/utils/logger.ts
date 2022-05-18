/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AppContext, Displayer } from "@netless/window-manager";
import type { SlideController } from "../SlideController";
import { isObj } from "./helpers";

type DebugMessage = { slide: boolean | "__instance" | "__debug" };

type RoomLogger = {
  debug: (...args: any) => void;
  info: (...args: any) => void;
  warn: (...args: any) => void;
};

class Logger {
  public apps: Record<
    string,
    { context?: AppContext | null; controller?: SlideController | null }
  > = {};

  setAppContext(appId: string, context: AppContext | null) {
    (this.apps[appId] ||= {}).context = context;
    this.log(`[Slide] new ${appId}`);
  }

  setAppController(appId: string, controller: SlideController | null) {
    (this.apps[appId] ||= {}).controller = controller;
  }

  deleteApp(appId: string) {
    delete this.apps[appId];
    this.log(`[Slide] delete ${appId}`);
  }

  public level: "debug" | "verbose" = import.meta.env.DEV ? "verbose" : "debug";

  public roomLogger: RoomLogger | null = null;

  constructor(public enable: boolean) {
    this.initialize();
  }

  initialize() {
    window.addEventListener("message", this._onMessage);
  }

  dispose() {
    window.removeEventListener("message", this._onMessage);
  }

  log(...args: any[]) {
    if (this.roomLogger) {
      this.roomLogger.info(...args);
    } else if (this.enable) {
      console.log(...args);
    }
  }

  verbose(...args: any[]) {
    if (this.roomLogger) {
      this.roomLogger.debug(...args);
    } else if (this.enable && this.level === "verbose") {
      console.log(...args);
    }
  }

  warn(...args: any[]) {
    if (this.roomLogger) {
      this.roomLogger.warn(...args);
    } else {
      console.warn(...args);
    }
  }

  /**
   * @example
   * window.postMessage({ slide: '__debug' })
   * window.dispatchEvent(new MessageEvent('message', { data: { slide: '__debug' } }))
   */
  _onMessage = (ev: MessageEvent<DebugMessage> | CustomEvent<DebugMessage>) => {
    let data: DebugMessage | undefined;
    if (ev instanceof CustomEvent) {
      data = ev.detail;
    } else if (isObj(ev.data)) {
      data = ev.data;
    }
    if (data) {
      if (typeof data.slide === "boolean") {
        this.enable = data.slide;
      } else if (data.slide === "__instance") {
        console.log(this);
      } else if (data.slide === "__debug") {
        Object.values(this.apps).forEach(app => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (app.controller?.slide as any)?.createController();
        });
      }
    }
  };
}

export const logger = /** @__PURE__ */ new Logger(import.meta.env.DEV);
export const log = /** @__PURE__ */ logger.log.bind(logger);
export const verbose = /** @__PURE__ */ logger.verbose.bind(logger);
export const setRoomLogger = (displayer: Displayer) => {
  logger.roomLogger = (displayer as any).logger;
};
