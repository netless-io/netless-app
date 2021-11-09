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
];

export default options;
