import type { PlaygroundConfig } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfig<Attributes> = {
  kind: "Countdown",
  src: () => import("./src"),
  options: {
    title: "Countdown",
  },
};

export default options;
