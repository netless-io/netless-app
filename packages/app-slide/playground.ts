import type { PlaygroundConfig, PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";
import { addHooks } from "./src/utils/freezer";

function definePPT(title: string, taskId: string, url?: string): PlaygroundConfig<Attributes> {
  return {
    kind: "Slide",
    src: () => import("./src"),
    options: { title, scenePath: `/Slide/${taskId}` },
    attributes: { taskId, url },
    addHooks,
  };
}

const options: PlaygroundConfigs<Attributes> = [
  definePPT(
    "ByeBye GoodBye",
    "5f36bc1041c811ecba2783d2bae94ad0",
    "https://convertcdn.netless.group/dynamicConvert"
  ),
  definePPT(
    "大凉山区",
    "8887363041c811ecba2783d2bae94ad0",
    "https://convertcdn.netless.group/dynamicConvert"
  ),
  definePPT(
    "开屏动画",
    "deb46e004b5611ecb2fbe336515f58dd",
    "https://convertcdn.netless.group/dynamicConvert"
  ),
  definePPT("星空", "e20da510429811eca24d2965b39c697a"),
  definePPT("简约蓝色多边形", "c98945a0478211ec82699ff3907ab497"),
  definePPT("开始使用 Flat", "9c8a8d50436011ec81562b933562aa06"),
];

export default options;
