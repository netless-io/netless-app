import type { SlideController } from "../SlideController";
import { isObj } from "./helpers";

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
  _onMessage = (ev: MessageEvent<{ slide: boolean | "__instance" }>) => {
    if (isObj(ev.data)) {
      if (typeof ev.data.slide === "boolean") {
        this.enable = ev.data.slide;
      } else if (ev.data.slide === "__instance") {
        console.log(this);
      }
    }
  };
}

export const logger = new Logger(import.meta.env.DEV);
export const log = logger.log.bind(logger);
export const verbose = logger.verbose.bind(logger);
