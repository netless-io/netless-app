import type { PlaygroundConfig } from "../playground/typings";
import type { Attributes } from "./src";
import Vote from "./src";

const options: PlaygroundConfig<Attributes> = {
  app: Vote,
  options: { title: "Vote" },
};

export default options;
