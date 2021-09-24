import type { PlaygroundConfig } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfig<Attributes> = {
  kind: "GeoGebra",
  src: () => import("./src"),
  options: {
    title: "GeoGebra",
  },
};

export default options;
