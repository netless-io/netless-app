import type { PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";
import IframeBridge from "./src";

const demo: { title: string; src: string }[] = [
  {
    title: "cocos",
    src: "https://demo-edu.cocos.com/agora-demo/index.html",
  },
  // target origin is not '*', so it won't work
  // {
  //   title: "qukoucai",
  //   src: "https://demo-h5.netless.group/docs/",
  // },
  {
    title: "chick",
    src: "https://demo-h5.netless.group/dist2020/",
  },
  // {
  //   title: "wzomo",
  //   src: "https://static.pre.wzomo.com/web/netless/index.html#/lesson1/page7?debug=1&role=teacher&origin=dev",
  // },
];

const options: PlaygroundConfigs<Attributes> = [
  {
    kind: IframeBridge.kind,
    src: () => import("./src"),
    options: {
      title: "demo",
    },
    attributes: {
      src: "/h5.html",
    },
  },
  ...demo.map(({ title, src }) => ({
    kind: IframeBridge.kind,
    src: () => import("./src"),
    options: {
      title,
      scenePath: `/h5/${title}`,
      scenes: [],
    },
    attributes: { src, displaySceneDir: `/h5/${title}` },
  })),
];

export default options;
