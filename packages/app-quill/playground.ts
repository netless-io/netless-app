import type { PlaygroundConfigs } from "../playground/typings";
import type { NetlessAppQuillAttributes } from "./src/index";

const options: PlaygroundConfigs<NetlessAppQuillAttributes> = [
  {
    kind: "Quill",
    src: () => import("./src"),
    options: {
      title: "Quill",
    },
  },
];

export default options;
