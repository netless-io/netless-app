/**

the page api for iframe bridge

iframe -> me:
  SetPage(3) // pages = [1,2,3]
  PageTo(1)  // page = 1
  PrevPage() // page = Math.max(1, page - 1)
  NextPage() // page = Math.min(pages.length, page + 1)

me -> iframe:
  RoomStateChanged(pageEvent(page))

*/

import type { RoomState } from "white-web-sdk";

export function fakeRoomStateChanged(
  page: number,
  maxPage: number,
  contextPath: string
): Partial<RoomState> {
  return {
    sceneState: {
      sceneName: `${page}`,
      scenePath: `${contextPath}/${page}`,
      contextPath,
      scenes: pageToScenes(maxPage),
      index: page - 1,
    },
  };
}

export function pageToScenes(maxPage: number): { name: string }[] {
  const scenes = [];
  for (let page = 1; page <= maxPage; ++page) {
    scenes.push({ name: String(page) });
  }
  return scenes;
}

export function prevPage(page: number): number {
  return Math.max(1, page - 1);
}

export function nextPage(page: number, maxPage: number): number {
  return Math.min(maxPage, page + 1);
}
