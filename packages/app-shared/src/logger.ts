import randomColor from "randomcolor";

export class Logger {
  private color = randomColor({ luminosity: "dark" });

  public constructor(public kind = "NetlessApp", public debug = import.meta.env.DEV) {}

  public log(...messages: unknown[]): void {
    return this._log("log", messages);
  }

  public warn(...messages: unknown[]): void {
    return this._log("warn", messages);
  }

  public error(...messages: unknown[]): void {
    return this._log("error", messages);
  }

  private _log(type: "log" | "warn" | "error", messages: unknown[]): void {
    if (this.debug) {
      console[type](`%c[${this.kind}]:`, `color: ${this.color}; font-weight: bold;`, ...messages);
    }
  }
}
