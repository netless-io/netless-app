import type { PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfigs<Attributes> = [
  {
    kind: "Slide",
    src: () => import("./src"),
    options: {
      title: "ByeBye GoodBye",
      scenePath: `/Slide/95eb57c02a5811ecbf79cb8646041469`,
    },
    attributes: {
      taskId: "95eb57c02a5811ecbf79cb8646041469",
      url: "https://convertcdn.netless.group/test/dynamicConvert",
    },
  },
  {
    kind: "Slide",
    src: () => import("./src"),
    options: {
      title: "开始使用 Flat",
      scenePath: `/Slide/88a3f7d0317311ec8157df475abc9776`,
    },
    attributes: {
      taskId: "88a3f7d0317311ec8157df475abc9776",
      url: "https://convertcdn.netless.group/dynamicConvert",
    },
  },
];

export default options;
