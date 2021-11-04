import randomColor from "randomcolor";

export type LoggerDebugLevel = boolean | "log" | "warn" | "error";

export class Logger {
  private color = randomColor({ luminosity: "dark" });

  public constructor(
    public kind = "NetlessApp",
    public debug: LoggerDebugLevel = import.meta.env.DEV || "error"
  ) {}

  public log(...messages: unknown[]): void {
    if (this.debug === true || this.debug === "log") {
      return this._log("log", messages);
    }
  }

  public warn(...messages: unknown[]): void {
    if (this.debug && this.debug !== "error") {
      return this._log("warn", messages);
    }
  }

  public error(...messages: unknown[]): void {
    if (this.debug) {
      return this._log("error", messages);
    }
  }

  private _log(type: "log" | "warn" | "error", messages: unknown[]): void {
    console[type](`%c[${this.kind}]:`, `color: ${this.color}; font-weight: bold;`, ...messages);
  }
}
