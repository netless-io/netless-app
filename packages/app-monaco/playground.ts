import type { PlaygroundConfigs } from "../playground/typings";
import type { NetlessAppMonacoAttributes } from "./src/typings";
import NetlessAppMonaco from "./src";

const options: PlaygroundConfigs<NetlessAppMonacoAttributes> = [
  {
    app: NetlessAppMonaco,
    options: {
      title: "Monaco",
    },
  },
];

export default options;
