import type { PlaygroundConfigs } from "../playground/typings";

const options: PlaygroundConfigs<void> = [
  {
    kind: "MindMap",
    src: () => import("./src"),
    options: {
      title: "MindMap",
    },
  },
];

export default options;
