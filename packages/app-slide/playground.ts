import type { PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfigs<Attributes> = [
  {
    kind: "Slide",
    src: () => import("./src"),
    options: {
      title: "ByeBye GoodBye",
      scenePath: `/Slide/5f36bc1041c811ecba2783d2bae94ad0`,
    },
    attributes: {
      taskId: "5f36bc1041c811ecba2783d2bae94ad0",
      url: "https://convertcdn.netless.group/dynamicConvert",
    },
  },
  {
    kind: "Slide",
    src: () => import("./src"),
    options: {
      title: "大凉山区",
      scenePath: `/Slide/8887363041c811ecba2783d2bae94ad0`,
    },
    attributes: {
      taskId: "8887363041c811ecba2783d2bae94ad0",
      url: "https://convertcdn.netless.group/dynamicConvert",
    },
  },
  {
    kind: "Slide",
    src: () => import("./src"),
    options: {
      title: "开屏动画",
      scenePath: `/Slide/deb46e004b5611ecb2fbe336515f58dd`,
    },
    attributes: {
      taskId: "deb46e004b5611ecb2fbe336515f58dd",
      url: "https://convertcdn.netless.group/dynamicConvert",
    },
  },
  {
    kind: "Slide",
    src: () => import("./src"),
    options: {
      title: "星空",
      scenePath: `/Slide/e20da510429811eca24d2965b39c697a`,
    },
    attributes: {
      taskId: "e20da510429811eca24d2965b39c697a",
    },
  },
  {
    kind: "Slide",
    src: () => import("./src"),
    options: {
      title: "简约蓝色多边形",
      scenePath: `/Slide/c98945a0478211ec82699ff3907ab497`,
    },
    attributes: {
      taskId: "c98945a0478211ec82699ff3907ab497",
    },
  },
  {
    kind: "Slide",
    src: () => import("./src"),
    options: {
      title: "开始使用 Flat",
      scenePath: `/Slide/9c8a8d50436011ec81562b933562aa06`,
    },
    attributes: {
      taskId: "9c8a8d50436011ec81562b933562aa06",
    },
  },
];

export default options;
