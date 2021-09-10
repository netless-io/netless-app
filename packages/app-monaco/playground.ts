import type { PlaygroundConfigs } from "../playground/typings";
import type { NetlessAppMonacoAttributes } from "./src/typings";
import { kind } from "./src/constants";

const options: PlaygroundConfigs<NetlessAppMonacoAttributes> = [
  {
    kind,
    src: () => import("./src"),
    options: {
      title: "Monaco",
    },
  },
];

export default options;
