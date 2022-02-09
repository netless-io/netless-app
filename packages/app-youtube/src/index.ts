import type { NetlessApp } from "@netless/window-manager";
import { loadYouTubeIframeAPI } from "./utils";

export interface Attributes {}

const YouTube: NetlessApp<Attributes> = {
  kind: "YouTube",
  setup(context) {
    context.storage;
    loadYouTubeIframeAPI;
    // TODO: create div#appid, new YT.Player(div#appid, { videoId })
  },
};

export default YouTube;
