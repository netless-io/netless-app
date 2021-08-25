/* eslint-disable max-len */
import type { PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";
import MediaPlayer from "./src";

const options: PlaygroundConfigs<Attributes> = [
  {
    app: MediaPlayer,
    options: {
      title: "MP4",
    },
    attributes: {
      src: "https://beings.oss-cn-hangzhou.aliyuncs.com/test/aaa59a55-81ff-45e8-8185-fd72c695def4/1606277539701637%E7%9A%84%E5%89%AF%E6%9C%AC.mp4",
      type: "video/mp4",
    },
  },
  {
    app: MediaPlayer,
    options: {
      title: "MP3",
    },
    attributes: {
      src: "https://beings.oss-cn-hangzhou.aliyuncs.com/test/2a90e310-1904-4a9a-8a86-9d6f3f4f8a78/%E9%99%88%E7%BB%AE%E8%B4%9E%20-%20%E5%A4%A9%E5%A4%A9%E6%83%B3%E4%BD%A0.mp3",
      type: "audio/mp3",
    },
  },
  {
    app: MediaPlayer,
    options: {
      title: "M3U8",
    },
    attributes: {
      src: "https://flat-storage.oss-cn-hangzhou.aliyuncs.com/agoraCloudRecording/0161a2a88de04a53b4ae1fa1489057a1/7ad747817e4caddcef19399f2625feb5_0161a2a8-8de0-4a53-b4ae-1fa1489057a1.m3u8",
    },
  },
];

export default options;
