import type { PreviewInfo, SlideAttributes, SlideInfo } from "./typings";

import { DefaultUrl } from "../constants";
import { noop, trim_slash } from "../utils";

export function make_prefix(taskId: string, url?: string) {
  return `${trim_slash(url || DefaultUrl)}/${taskId}`;
}

export async function fetch_slide_info({ taskId, url }: SlideAttributes): Promise<{
  preview: PreviewInfo | null;
  slide: SlideInfo;
}> {
  const prefix = make_prefix(taskId, url);
  const imgSrc = `${prefix}/preview/1.png`;
  const jsonUrl = `${prefix}/jsonOutput/slide-1.json`;

  const p1 = new Promise<PreviewInfo | null>(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = imgSrc;
  });

  const p2: Promise<SlideInfo> = fetch(jsonUrl).then(r => r.json());

  return { preview: await p1, slide: await p2 };
}

export function on_visibility_change(callback: (visible: boolean) => void) {
  if (typeof document !== "undefined") {
    const listener = () => callback(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }
  return noop;
}
