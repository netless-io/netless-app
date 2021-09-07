import type { PlaygroundConfig } from "../playground/typings";
import type { Attributes } from "./src";
import Browser from "./src";

const options: PlaygroundConfig<Attributes> = {
  app: Browser,
  options: {
    title: "Browser",
  },
};

export default options;
