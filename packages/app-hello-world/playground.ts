import type { PlaygroundConfigs } from "../playground/typings";
import HelloWorld from "./src";
import TwoRange from "./src/two-range";

const options: PlaygroundConfigs = [
  {
    app: HelloWorld,
    options: { title: "Hello, world!" },
  },
  {
    app: TwoRange,
    options: { title: "2 range" },
  },
];

export default options;
