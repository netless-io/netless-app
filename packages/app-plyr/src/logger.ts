import type { AppContext } from "@netless/window-manager";

type LogLevel = "debug" | "info" | "warn" | "error";
export type PlyrLogger = Record<LogLevel, (...messages: unknown[]) => void>;

/** SDK loggers may stringify details with String(), losing object fields. */
function formatLogValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? String(value) : value;
  }
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, item) => {
      if (typeof item === "bigint") return String(item);
      if (item && typeof item === "object") {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
        if (item instanceof Error) {
          return { name: item.name, message: item.message, stack: item.stack };
        }
      }
      return item;
    }) ?? "[Unserializable]";
  } catch {
    return "[Unserializable]";
  }
}

/** Use the room's existing logging pipeline with a single component prefix. */
export function createPlyrLogger(context: AppContext): PlyrLogger {
  const room = context.getRoom() as { logger?: Partial<PlyrLogger> } | undefined;
  const displayer = context.getDisplayer() as { logger?: Partial<PlyrLogger> };
  const target = room?.logger || displayer?.logger;
  const write = (level: LogLevel, message: unknown, ...details: unknown[]): void => {
    const text = String(formatLogValue(message)).replace(/^(?:\[Plyr\]:?\s*)+/, "");
    const messages = [`[Plyr] ${text}`, ...details.map(formatLogValue)];
    try {
      if (typeof target?.[level] === "function") {
        target[level]!.apply(target, messages);
        return;
      }
    } catch {
      // Diagnostic failures must not interrupt playback or room synchronization.
    }
    console[level](...messages);
  };
  return {
    debug: (...messages) => write("debug", messages[0], ...messages.slice(1)),
    info: (...messages) => write("info", messages[0], ...messages.slice(1)),
    warn: (...messages) => write("warn", messages[0], ...messages.slice(1)),
    error: (...messages) => write("error", messages[0], ...messages.slice(1)),
  };
}
