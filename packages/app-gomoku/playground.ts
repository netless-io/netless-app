import type { PlaygroundConfig } from "../playground/typings";

const options: PlaygroundConfig = {
  kind: "Gomoku",
  src: () => import("./src"),
  options: {
    title: "Gomoku",
  },
};

export default options;
