/* eslint-disable @typescript-eslint/no-explicit-any */

export function isObj(e: unknown): e is Record<string, any> {
  return typeof e === "object" && e !== null;
}
