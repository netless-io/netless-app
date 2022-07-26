import { genUID } from "side-effect-manager";

export { genUID as next_id };

export function element<T extends keyof HTMLElementTagNameMap>(tag: T) {
  return document.createElement(tag);
}

export function add_class<T extends HTMLElement>(el: T, name: string) {
  el.className = `netless-app-mindmap-${name}`;
  return el;
}

export function next_tick() {
  return Promise.resolve();
}
