import type { AppContext } from "@netless/window-manager";

export interface UserPayload {
  memberId: number;
  uid: string;
  nickName: string;
}

export function getUserPayload(context: AppContext): UserPayload {
  const room = context.getRoom();
  const displayer = context.getDisplayer();
  const memberId = displayer.observerId;
  const userPayload = displayer.state.roomMembers.find(
    member => member.memberId === memberId
  )?.payload;
  const uid = room?.uid || userPayload?.uid || "";
  const nickName = userPayload?.nickName || uid;
  return { memberId, uid, nickName };
}

// from @polka/url (https://github.com/lukeed/polka, MIT license)
export function parse(url: string) {
  const index = url.indexOf("?", 1);
  if (index !== -1) {
    return {
      search: url.slice(index),
      pathname: url.slice(0, index),
    };
  }
  return {
    search: "",
    pathname: url,
  };
}

export function appendQuery(url: string, query: string) {
  const { pathname, search } = parse(url);
  return pathname + (search ? `${search}&` : "?") + query;
}

const hasOwn = Object.prototype.hasOwnProperty;

export function h(tag: string, attrs: Record<string, string> = {}, children?: string) {
  const el = document.createElement(tag);
  for (const key in attrs) {
    if (hasOwn.call(attrs, key)) {
      el.setAttribute(key, attrs[key]);
    }
  }
  if (children) {
    el.textContent = children;
  }
  return el;
}
