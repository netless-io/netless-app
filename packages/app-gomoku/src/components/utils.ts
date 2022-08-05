import type { AppContext } from "@netless/window-manager";

export function wrap(name: string) {
  return `netless-app-gomoku-${name}`;
}

export type MemberIDType = string;

export function getMembers(members: AppContext["members"]): MemberIDType[] {
  const array = members.map(member => member.payload?.uid).filter(Boolean) as string[];
  return Array.from(new Set(array)).sort();
}

export function getNickNameByUID(members: AppContext["members"], uid: string): string {
  const payload = members.find(e => e.uid === uid)?.payload || {};
  return ((payload as Record<string, unknown>)["nickName"] as string) || uid;
}
