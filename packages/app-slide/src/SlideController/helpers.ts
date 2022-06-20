import type { Slide } from "@netless/slide";
import type { WhiteBoardView } from "@netless/window-manager";
import { DefaultUrl } from ".";
import type { DocsViewerPage } from "../DocsViewer";

export function createDocsViewerPages(slide: Slide): DocsViewerPage[] {
  const { width, height, slideCount, slideState } = slide;
  const { taskId, url } = slideState;
  const pages: DocsViewerPage[] = [];
  for (let i = 1; i <= slideCount; ++i) {
    pages.push({ width, height, thumbnail: `${url}/${taskId}/preview/${i}.png`, src: "ppt" });
  }
  return pages;
}

// because `renderSlide()` is slow, but switching between scenes in whiteboard is fast
// so here we make scenes sync with slide page
export function syncSceneWithSlide(view: WhiteBoardView, slide: Slide) {
  const page = slide.slideState.currentSlideIndex;
  if (!(page > 0 && slide.slideCount > 0)) return;
  if (view.pageState.length < slide.slideCount) {
    let n = slide.slideCount - view.pageState.length;
    while (n--) view.addPage();
  }
  view.jumpPage(page - 1);
}

export async function fetchSlideCount(taskId: string, url = DefaultUrl) {
  if (!url.endsWith("/")) url += "/";
  const { slideCount } = await fetch(`${url}${taskId}/jsonOutput/slide-1.json`).then(r => r.json());
  return slideCount as number;
}
