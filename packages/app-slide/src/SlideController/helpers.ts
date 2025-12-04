import type { AppContext, Room } from "@netless/window-manager";
import type { ScenePathType } from "white-web-sdk";
import type { Slide } from "@netless/slide";
import type { DocsViewerPage } from "../DocsViewer";
import type { Attributes } from "../typings";
import type { AppliancePluginInstance } from "@netless/appliance-plugin";
import { log, warn } from "../utils/logger";

export function createDocsViewerPages(slide: Slide, previewUrls: string[] = []): DocsViewerPage[] {
  const { width, height, slideCount, slideState } = slide;
  const { taskId, url } = slideState;
  const pages: DocsViewerPage[] = [];
  for (let i = 1; i <= slideCount; ++i) {
    const signedUrl = previewUrls.find(v => v.indexOf(`preview/${i}.png`) >= 0);
    if (signedUrl) {
      pages.push({ width, height, thumbnail: signedUrl, src: "ppt" });
    } else {
      pages.push({ width, height, thumbnail: `${url}/${taskId}/preview/${i}.png`, src: "ppt" });
    }
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
  // 只有打开ppt用户，并且场景路径不是页面(未被其它用户创建出页面)，则需要同步场景
  if (context.isAddApp && room.scenePathType(scenePath) !== ("page" as ScenePathType.Page)) {
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

  if (
    currentScenePath !== scenePath &&
    room.scenePathType(scenePath) === ("page" as ScenePathType.Page)
  ) {
    context.setScenePath(scenePath);
  }
}

export function renderSceneWithSlide(
  room: Room,
  context: AppContext<Attributes>,
  slide: Slide,
  baseScenePath: string,
  appliancePlugin: AppliancePluginInstance,
  needCount: boolean,
  count: number = 1000
) {
  if (needCount && count <= 0) {
    warn('[Slide] renderSceneWithSlide count <= 0', count);
    return;
  }
  const page = slide.slideState.currentSlideIndex;
  if (!(page > 0)) return;
  const scenePath = [baseScenePath, page].join("/");
  // 只有打开ppt用户，并且场景路径不是页面(未被其它用户创建出页面)，则需要同步场景
  let isFirstRender = false;
  if ((needCount && count === 100 || !needCount) && context.isAddApp && context.getIsWritable() && room.scenePathType(scenePath) !== ("page" as ScenePathType.Page)) {
    room.removeScenes(baseScenePath);
    const count = slide.slideCount;
    const scenes: { name: string }[] = [];
    for (let i = 1; i <= count; ++i) scenes.push({ name: `${i}` });
    room.putScenes(baseScenePath, scenes);
    isFirstRender = true;
  }

  let currentScenePath: string;
  if (context.getBox().focus) {
    currentScenePath = room.state.sceneState.scenePath;
  } else {
    currentScenePath = context.getView()?.focusScenePath || "";
  }
  if (currentScenePath !== scenePath && room.scenePathType(scenePath) === ("page" as ScenePathType.Page)) {
    context.setScenePath(scenePath);
  }

  const view = appliancePlugin.currentManager?.viewContainerManager.getView(context.appId);
  if (view) {
    needCount && log('[Slide] setViewLocalScenePathChange count', count);
    appliancePlugin.setViewLocalScenePathChange(scenePath, context.appId);
  } else if(needCount) {
    requestAnimationFrame(() => {
      renderSceneWithSlide(room, context, slide, baseScenePath, appliancePlugin, needCount, count - 1);
    });
  }
}