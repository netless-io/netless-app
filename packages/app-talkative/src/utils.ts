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

export function element<T extends keyof HTMLElementTagNameMap>(tag: T) {
  return document.createElement(tag);
}

export function attr(el: HTMLElement, key: string, value: string | null) {
  if (value == null) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, value);
  }
}

export function append(el: HTMLElement, node: HTMLElement) {
  return el.appendChild(node);
}

export function detach(el: HTMLElement) {
  return el.parentNode?.removeChild(el);
}

export function noop() {
  // noop
}

export const nextTick = /* @__PURE__ */ Promise.resolve();

export function writable<T>(value: T) {
  const listeners: Array<(value: T) => void> = [];

  return {
    get value() {
      return value;
    },
    set(newValue: T) {
      value = newValue;
      listeners.forEach(listener => listener(value));
    },
    subscribe(listener: (value: T) => void) {
      listeners.push(listener);
      nextTick.then(() => listener(value));
      return () => {
        listeners.splice(listeners.indexOf(listener), 1);
      };
    },
  };
}
