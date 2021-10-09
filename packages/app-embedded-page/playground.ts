import type { PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfigs<Attributes> = [
  {
    kind: "EmbeddedPage",
    src: () => import("./src"),
    options: {
      title: "demo",
      scenePath: "/demo",
      scenes: [{ name: "1" }],
    },
    attributes: {
      src: "/embed.html",
    },
  },
];

export default options;
