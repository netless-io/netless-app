import type { PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";

const demo: { title: string; src: string }[] = [
  {
    title: "vf-engine",
    src: "https://vf-cdn.yunkc.cn/platform/netless/v1/index.html?total=5&docKey=4821a83c-7d61-4e23-8f6f-c23391e19dc5",
  },
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
    kind: "IframeBridge",
    src: () => import("./src"),
    options: {
      title: "demo",
    },
    attributes: {
      src: "/h5.html",
    },
  },
  ...demo.map(({ title, src }) => ({
    kind: "IframeBridge",
    src: () => import("./src"),
    options: {
      title,
      // add `scenePath` will make it use _Pages_ feature
      // make sure to call `SetPage` first
      // otherwise you may not be able to click on it
      scenePath: `/h5/${title}`,
      scenes: [],
    },
    attributes: { src, displaySceneDir: `/h5/${title}` },
  })),
];

export default options;
