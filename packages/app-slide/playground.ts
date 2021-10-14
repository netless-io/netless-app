import type { PlaygroundConfig } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfig<Attributes> = {
  kind: "Slide",
  src: () => import("./src"),
  options: {
    title: "Slide",
    scenePath: `/Slide/95eb57c02a5811ecbf79cb8646041469`,
  },
  attributes: {
    taskId: "95eb57c02a5811ecbf79cb8646041469",
    url: "https://convertcdn.netless.group/test/dynamicConvert",
  },
};

export default options;
