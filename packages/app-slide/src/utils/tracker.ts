import type { Displayer } from "white-web-sdk";
import type { ISlideConfig } from "@netless/slide";

export const getRoomTracker = (displayer: Displayer): ISlideConfig["whiteTracker"] => {
  return (displayer as unknown as { tracker: ISlideConfig["whiteTracker"] }).tracker;
};
