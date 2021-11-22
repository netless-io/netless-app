import type { AppContext, Room } from "@netless/window-manager";
import type { ScenePathType } from "white-web-sdk";
import type { Slide } from "@netless/slide";
import type { DocsViewerPage } from "../DocsViewer";
import type { Attributes } from "../typings";

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
export function syncSceneWithSlide(
  room: Room,
  context: AppContext<Attributes>,
  slide: Slide,
  baseScenePath: string
) {
  const page = slide.slideState.currentSlideIndex;
  if (!(page > 0) || !context.getIsWritable()) return;

  const scenePath = [baseScenePath, page].join("/");

  if (room.scenePathType(scenePath) !== ("page" as ScenePathType.Page)) {
    room.removeScenes(baseScenePath);
    const count = slide.slideCount;
    const scenes: { name: string }[] = [];
    for (let i = 1; i <= count; ++i) scenes.push({ name: `${i}` });
    room.putScenes(baseScenePath, scenes);
  }

  let currentScenePath: string;
  if (context.getBox().focus) {
    currentScenePath = room.state.sceneState.scenePath;
  } else {
    currentScenePath = context.getView()?.focusScenePath || "";
  }

  if (currentScenePath !== scenePath) {
    context.setScenePath(scenePath);
  }
}
