import type { AppContext } from "@netless/window-manager";

export interface ILogger {
  info(this: void, msg: string): void;
}

function getRoomLogger(context: AppContext) {
  return (context.displayer as unknown as { logger: ILogger }).logger;
}

export class Logger implements ILogger {
  static active = new Set<string>();
  static roomLogger: ILogger | null = null;

  constructor(readonly context: AppContext | null) {
    if (context) {
      Logger.active.add(context.appId);
      Logger.roomLogger = getRoomLogger(context);
    }
  }

  info = (msg: string) => {
    if (Logger.roomLogger && this.context) {
      Logger.roomLogger.info(msg + ` (${this.context.appId})`);
    } else if (this.context) {
      console.debug(msg + ` (${this.context.appId})`);
    } else {
      console.debug(msg);
    }
  };

  destroy() {
    this.context && Logger.active.delete(this.context.appId);
    if (Logger.active.size === 0) {
      Logger.roomLogger = null;
    }
  }
}
