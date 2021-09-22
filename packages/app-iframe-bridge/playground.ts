import type { PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";
import IframeBridge from "./src";

const options: PlaygroundConfigs<Attributes> = [
  {
    kind: IframeBridge.kind,
    src: () => import("./src"),
    options: {
      title: "Simple",
    },
    attributes: {
      src: "/h5.html",
    },
  },
  {
    kind: IframeBridge.kind,
    src: () => import("./src"),
    options: {
      title: "Cocos",
      scenePath: `/h5`,
      scenes: [],
    },
    attributes: {
      src: "https://demo-edu.cocos.com/agora-demo/index.html",
    },
  },
];

export default options;
