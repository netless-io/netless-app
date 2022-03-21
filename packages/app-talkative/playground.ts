import type { PlaygroundConfigs } from "../playground/typings";
import type { TalkativeAttributes } from "./src";

const options: PlaygroundConfigs<TalkativeAttributes> = [
  {
    kind: "Talkative",
    src: () => import("./src"),
    options: {
      title: "Custom",
    },
    attributes: {
      src: "http://localhost:4567",
    },
    getAttributes() {
      const result = { src: "" };
      result.src = window.prompt("src?", "https://example.org") || "";
      if (!result.src) return null;
      return result;
    },
  },
];

export default options;
