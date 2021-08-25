import type { PlaygroundConfig } from "../playground/typings";
import DocsViewer from "./src";

const options: PlaygroundConfig = {
  app: DocsViewer,
  options: {
    scenePath: "/test4",
    title: "ppt1",
    scenes: [
      {
        name: "1",
        ppt: {
          height: 1010,
          src: "https://convertcdn.netless.link/staticConvert/18140800fe8a11eb8cb787b1c376634e/1.png",
          width: 714,
        },
      },
      {
        name: "2",
        ppt: {
          height: 1010,
          src: "https://convertcdn.netless.link/staticConvert/18140800fe8a11eb8cb787b1c376634e/2.png",
          width: 714,
        },
      },
    ],
  },
};

export default options;
