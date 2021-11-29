import ColorString from "color-string";
import { log } from "./logger";

export function guessBgColor(el: HTMLElement): string {
  try {
    const bg = window.getComputedStyle(el).backgroundColor;
    if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      return bg;
    }
    if (el.parentElement) {
      return guessBgColor(el.parentElement);
    }
  } catch {
    // ignore any error
  }
  return "#ffffff";
}

export function toHex(color: string): string {
  const result = ColorString.get(color);
  if (result && result.model === "rgb") {
    const args = result.value;

    // https://github.com/Qix-/color-convert/blob/8dfdbbc6b46fa6a305bf394d942cc1b08e23fca5/conversions.js#L616
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

let cachedBgColor = "";

export function cachedGetBgColor(el: HTMLElement): string {
  if (!cachedBgColor) {
    cachedBgColor = toHex(guessBgColor(el));
    log("[Slide] guess bg color", cachedBgColor);
  }
  return cachedBgColor;
}
