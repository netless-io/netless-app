import type { PlaygroundConfigs } from "../playground/typings";
import type { NetlessAppMonacoAttributes } from "./src/typings";
import NetlessAppMonaco from "./src";

const options: PlaygroundConfigs<NetlessAppMonacoAttributes> = [
  {
    app: NetlessAppMonaco,
    options: {
      scenePath: `/${NetlessAppMonaco.kind}/1`,
      title: "VSCode",
    },
  },
];

export default options;
