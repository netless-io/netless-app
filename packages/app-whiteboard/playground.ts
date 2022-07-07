import type { PlaygroundConfig } from "../playground/typings";

const options: PlaygroundConfig<void> = {
  kind: "Whiteboard",
  src: () => import("./src"),
  options: {
    title: "Whiteboard",
  },
};

export default options;
