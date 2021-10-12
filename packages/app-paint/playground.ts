import type { PlaygroundConfig } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfig<Attributes> = {
  kind: "Paint",
  src: () => import("./src"),
  options: {
    title: "Paint",
  },
};

export default options;
