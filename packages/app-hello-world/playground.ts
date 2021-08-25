import type { PlaygroundConfig } from "../playground/typings";
import HelloWorld from "./src";

const options: PlaygroundConfig = {
  app: HelloWorld,
  options: { title: "Hello, world!" },
};

export default options;
