import type { PlaygroundConfigs } from "../playground/typings";

const options: PlaygroundConfigs<void> = [
  {
    kind: "Dice",
    src: () => import("./src"),
    options: {
      title: "Dice",
    },
  },
];

export default options;
