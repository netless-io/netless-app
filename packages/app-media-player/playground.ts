import type { PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";
import MediaPlayer from "./src";

const options: PlaygroundConfigs<Attributes> = [
  {
    app: MediaPlayer,
    options: {
      title: "MP3",
    },
    attributes: {
      volume: 80,
    },
  },
];

export default options;
