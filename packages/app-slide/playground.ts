import type { PlaygroundConfig, PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";
import { addHooks } from "./src/utils/freezer";
import type { CustomLink } from "@netless/slide";

function definePPT(
  title: string,
  taskId: string,
  url?: string,
  customLinks?: CustomLink[]
): PlaygroundConfig<Attributes> {
  return {
    kind: "Slide",
    src: () => import("./src"),
    appOptions: { enableScale: true },
    options: { title, scenePath: `/Slide/${taskId}/${title}` },
    attributes: { taskId, url, customLinks },
    addHooks,
  };
}

const options: PlaygroundConfigs<Attributes> = [
  // 可写 Tab 1 & 2
  definePPT("Writable-1", "9abed6605bbc11ec88a83b917638a00c", "", [
    { pageIndex: 1, shapeId: "slide-19", link: "https://www.baidu.com" },
  ]),
  definePPT("Writable-2", "9abed6605bbc11ec88a83b917638a00c"),
  // 只读 Tab 1 & 2
  definePPT("Readonly-1", "9abed6605bbc11ec88a83b917638a00c"),
  definePPT("Readonly-2", "9abed6605bbc11ec88a83b917638a00c"),
];

export default options;
