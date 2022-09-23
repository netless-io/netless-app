import type { AppContext, Player } from "@netless/window-manager";

import ColorString from "color-string";
import { class_name } from "./constants";

export function noop() {
  return;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K) {
  return document.createElement(tag);
}

export function hc<K extends keyof HTMLElementTagNameMap>(tag: K, name: string) {
  const el = h(tag);
  set_class(el, name);
  return el;
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

export function block<T = void>(): [p: Promise<T>, resolve: (t: T) => void] {
  let resolve!: (t: T) => void;
  const p = new Promise<T>(r => {
    resolve = r;
  });
  return [p, resolve];
}

export function make_timestamp(context: AppContext): () => number {
  const room = context.room;
  const player = context.displayer as Player;
  if (room) {
    return () => room.calibrationTimestamp;
  } else if (player) {
    return () => player.beginTimestamp + player.progressTime;
  } else {
    return () => Date.now();
  }
}

export function make_bg_color(el: HTMLElement): string {
  try {
    let bg = window.getComputedStyle(el).backgroundColor;
    if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      bg = hex(bg);
      console.log("[Slide] guess bg color:", bg);
      return bg;
    }
    if (el.parentElement) {
      return make_bg_color(el.parentElement);
    }
  } catch {
    // ignored
  }
  return "#ffffff";
}

// https://github.com/Qix-/color-convert/blob/8dfdbbc6b46fa6a305bf394d942cc1b08e23fca5/conversions.js#L616
export function hex(color: string): string {
  const result = ColorString.get(color);
  if (result && result.model === "rgb") {
    const args = result.value;

    const integer =
      ((Math.round(args[0]) & 0xff) << 16) +
      ((Math.round(args[1]) & 0xff) << 8) +
      (Math.round(args[2]) & 0xff);

    const string = integer.toString(16);
    return "#" + "000000".substring(string.length) + string;
  } else {
    return color;
  }
}
