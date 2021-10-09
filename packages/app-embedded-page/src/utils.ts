export function isObj(e: unknown): e is Record<string, unknown> {
  return typeof e === "object" && e !== null;
}
