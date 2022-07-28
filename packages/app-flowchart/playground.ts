import type { PlaygroundConfigs } from "../playground/typings";
import type { FlowchartAttributes } from "./src";

const options: PlaygroundConfigs<FlowchartAttributes> = [
  {
    kind: "Flowchart",
    src: () => import("./src"),
    options: {
      title: "Flowchart",
    },
  },
];

export default options;
