/* eslint-disable max-len */
import type { PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";

const options: PlaygroundConfigs<Attributes> = [
  {
    kind: "Plyr",
    src: () => import("./src"),
    options: {
      title: "MP4",
    },
    attributes: {
      src: "https://flat-storage.oss-accelerate.aliyuncs.com/cloud-storage/2022-03/28/e35a6676-aa5d-4a61-8f17-87e626b7d1b7/e35a6676-aa5d-4a61-8f17-87e626b7d1b7.mp4",
      type: "video/mp4",
    },
  },
  {
    kind: "Plyr",
    src: () => import("./src"),
    options: {
      title: "MP3",
    },
    attributes: {
      src: "https://flat-storage.oss-accelerate.aliyuncs.com/cloud-storage/2022-03/28/f663cdcc-3367-4a15-8d2d-65fa4302c782/f663cdcc-3367-4a15-8d2d-65fa4302c782.mp3",
      type: "audio/mp3",
    },
  },
  {
    kind: "Plyr",
    src: () => import("./src"),
    options: {
      title: "M3U8",
    },
    attributes: {
      src: "https://flat-storage.oss-cn-hangzhou.aliyuncs.com/agoraCloudRecording/0e36cd1e110a45ee82f21fd4c5f5b3d3/534a5e19ff4e7a1807a540b386ad4162_0e36cd1e-110a-45ee-82f2-1fd4c5f5b3d3.m3u8",
    },
  },
  {
    kind: "Plyr",
    src: () => import("./src"),
    options: {
      title: "YouTube",
    },
    attributes: {
      src: "https://www.youtube.com/embed/bTqVqk7FSmY",
      provider: "youtube",
    },
  },
];

export default options;
