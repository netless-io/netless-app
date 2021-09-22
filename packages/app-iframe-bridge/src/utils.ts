export function times(page: number): { name: string }[] {
  return Array(page)
    .fill(0)
    .map((_, i) => ({ name: String(i + 1) }));
}

export function createIframe(): HTMLIFrameElement {
  return document.createElement("iframe");
}

export function createView(): HTMLDivElement {
  const div = document.createElement("div");
  div.classList.add("netless-app-iframe-bridge-view");
  return div;
}

export function createMask(...el: HTMLElement[]): HTMLDivElement {
  const div = document.createElement("div");
  div.title = "Netless App Iframe Bridge";
  div.classList.add("netless-app-iframe-bridge");
  div.append(...el);
  return div;
}
