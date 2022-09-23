import type { SlideViewerOptions } from "./SlideViewer";

import { SlideViewer } from "./SlideViewer";

export function previewSlide(options: SlideViewerOptions & { container: HTMLElement }) {
  const { container, ...slideOptions } = options;
  const wrapper = document.createElement("div");
  wrapper.className = "netless-app-slide-preview-wrapper";
  const viewer = new SlideViewer(slideOptions);
  wrapper.appendChild(document.createElement("style")).textContent = SlideViewer.styles;
  wrapper.appendChild(viewer.$content);
  wrapper.appendChild(viewer.$footer);
  container.appendChild(wrapper);
  viewer.prepare(() => viewer.slide.renderSlide(1));
  return viewer;
}

if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).previewSlide = previewSlide;
}
