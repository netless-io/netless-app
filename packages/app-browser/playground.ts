import type { PlaygroundConfig } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfig<Attributes> = {
  kind: "Browser",
  src: () => import("./src"),
  options: {
    title: "Browser",
  },
  attributes: {
    url: "https://example.org/",
  },
};

export default options;
