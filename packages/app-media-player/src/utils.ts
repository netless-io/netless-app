/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-function */
import type Plyr from "plyr";

export function youtube_parseId(url: string) {
  const regex = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regex);
  return match ? match[2] : url;
}

/**
 * Return `true` means ok, `false` means some error occurs.
 */
export async function safePlay(player: Plyr): Promise<boolean> {
  try {
    await player.play();
    return true;
  } catch (err) {
    player.muted = true;
    await player.play();
    console.debug(err);
    return false;
  }
}

export function importScript(src: string): Promise<void> {
  const script = document.createElement("script");
  return new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = reject;
    script.src = src;
    document.head.appendChild(script);
  });
}

import type Hls from "hls.js";
export async function loadHLS(): Promise<Hls> {
  const fakeHls = {
    loadSource(_src: string) {},
    attachMedia(_el: Element) {},
  } as Hls;

  let hlsClass = (window as any).Hls;
  if (hlsClass === null || hlsClass === false) {
    return fakeHls;
  } else if (hlsClass === undefined) {
    await importScript("https://cdn.jsdelivr.net/npm/hls.js@latest");
    hlsClass = (window as any).Hls;
  }

  if (typeof hlsClass === "function") {
    try {
      return new hlsClass();
    } catch (err) {
      console.debug(err);
      return fakeHls;
    }
  } else {
    return fakeHls;
  }
}

export function cannotPlayHLSNatively(
  playerEl: HTMLElement | HTMLVideoElement | HTMLAudioElement
): playerEl is HTMLVideoElement {
  return "canPlayType" in playerEl && !playerEl.canPlayType("application/vnd.apple.mpegurl");
}
