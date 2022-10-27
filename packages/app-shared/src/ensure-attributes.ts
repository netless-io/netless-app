/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AppContext } from "@netless/window-manager";

function isObject(val: unknown): val is Record<string, unknown> {
  return val != null && typeof val === "object" && !Array.isArray(val);
}

export function ensureAttributes<T extends Record<string, any>>(
  context: AppContext<T>,
  initAttrs: T
): T {
  let attrs = context.getAttributes();
  if (!attrs) {
    context.setAttributes(initAttrs);
    attrs = context.getAttributes();
  }
  if (!attrs) {
    throw new Error("[NetlessAppMonaco] No attributes");
  }
  if (isObject(initAttrs)) {
    Object.keys(initAttrs).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(attrs, key)) {
        context.updateAttributes([key], initAttrs[key]);
      }
    });
  }
  return attrs;
}
