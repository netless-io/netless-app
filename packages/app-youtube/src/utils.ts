/* eslint-disable @typescript-eslint/no-explicit-any */

// https://developers.google.com/youtube/iframe_api_reference
// https://gist.github.com/bajpangosh/d322c4d7823d8707e19d20bc71cd5a4f

let imported = false;

export function importScript(src: string, id: string): Promise<void> {
  if (imported) return Promise.resolve();

  const exist = document.getElementById(id);
  if (exist) return Promise.resolve();

  const script = document.createElement("script");
  script.id = id;

  return new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = reject;
    script.src = src;
    document.head.appendChild(script);
    imported = true;
  });
}

export function onYouTubeIframeAPIReady(callback: () => void) {
  if (window.YT && window.YT.Player) {
    callback();
  } else if ((window as any).onYouTubeIframeAPIReady) {
    const old = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      old(), callback();
    };
  } else {
    (window as any).onYouTubeIframeAPIReady = callback;
  }
}

export async function loadYouTubeIframeAPI() {
  await importScript("https://www.youtube.com/iframe_api", "netless-app-youtube-iframe-api");
  return new Promise<void>(onYouTubeIframeAPIReady);
}
