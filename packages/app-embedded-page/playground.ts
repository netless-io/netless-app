import type { PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";

const demo: { title: string; src: string }[] = [
  {
    title: "Scratch",
    src: "http://192.168.31.195:8601/",
    // scenePath: `/embedded-page/${title}`,
  },
];

const options: PlaygroundConfigs<Attributes> = [
  {
    kind: "EmbeddedPage",
    src: () => import("./src"),
    options: {
      title: "demo",
      scenePath: "/demo",
    },
    attributes: {
      src: "./embed.html",
    },
  },
  ...demo.map(({ title, src }) => ({
    kind: "EmbeddedPage",
    src: () => import("./src"),
    options: {
      title,
    },
    attributes: {
      src,
    },
  })),
];

export default options;
