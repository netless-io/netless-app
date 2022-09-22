import { class_name } from "./constants";

export function noop() {
  return;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K) {
  return document.createElement(tag);
}

export function append(parent: HTMLElement, child: HTMLElement) {
  return parent.appendChild(child);
}

export function wrap_class(name: string) {
  return `${class_name}-${name}`;
}

export function set_class(el: HTMLElement, name: string) {
  el.className = wrap_class(name);
}

export function trim_slash(s: string) {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

export function get(o: unknown, k: string): unknown {
  if (typeof o === "object" && o !== null) return (o as Record<string, unknown>)[k];
}
