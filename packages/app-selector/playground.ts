import type { PlaygroundConfigs } from "../playground/typings";

const options: PlaygroundConfigs = [
  {
    kind: "Selector",
    src: () => import("./dist/main" as any),
    options: {
      title: "selector",
    },
  },
];

export default options;
