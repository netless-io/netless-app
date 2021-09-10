import type { PlaygroundConfig } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfig<Attributes> = {
  kind: "Vote",
  src: () => import("./src"),
  options: { title: "Vote" },
};

export default options;
