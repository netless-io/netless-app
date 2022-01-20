import type { PlaygroundConfig } from "../playground/typings";

const options: PlaygroundConfig = {
  kind: "Countdown",
  src: () => import("./src"),
  options: {
    title: "Countdown",
  },
};

export default options;
