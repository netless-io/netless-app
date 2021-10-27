/* eslint-disable @typescript-eslint/no-explicit-any */
export function isObj(e: any): e is Record<string, any> {
  return typeof e === "object" && e !== null;
}

export function isRef(e: unknown): e is { k: string; v: any } {
  return Boolean(isObj(e) && e.__isRef);
}

export function makeRef(v: any) {
  return { k: genId(), v, __isRef: true };
}

export function genId() {
  return Math.random().toString(36).slice(2);
}
