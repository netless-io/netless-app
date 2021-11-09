import type { PlaygroundConfig } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfig<Attributes> = {
  kind: "BlinkMind",
  src: () => import("./dist/main.es.js"),
  options: {
    title: "BlinkMind",
  },
};

export default options;
