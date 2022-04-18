import type { SlideController } from "../SlideController";
import { isObj } from "./helpers";

type DebugMessage = { slide: boolean | "__instance" | "__debug" };

class Logger {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public apps: Record<string, { context?: any; controller?: SlideController }> = {};
  public level: "debug" | "verbose" = import.meta.env.DEV ? "verbose" : "debug";
  constructor(public enable: boolean) {
    window.addEventListener("message", this._onMessage);
  }
  log(...args: Parameters<Console["log"]>) {
    if (this.enable) {
      console.log(...args);
    }
  }
  verbose(...args: Parameters<Console["log"]>) {
    if (this.enable && this.level === "verbose") {
      console.log(...args);
    }
  }
  dispose(appId: string) {
    this.enable = false;
    delete this.apps[appId];
    window.removeEventListener("message", this._onMessage);
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

export const logger = new Logger(import.meta.env.DEV);
export const log = logger.log.bind(logger);
export const verbose = logger.verbose.bind(logger);
