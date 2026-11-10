import type { AppContext } from "@netless/window-manager";
import type { Attributes } from ".";
import type { Sync } from "./sync";
import type { PlyrLogger } from "./logger";

import { SvelteComponentTyped } from "svelte";

export declare interface PlayerProps {
  storage?: AppContext<Attributes>["storage"];
  sync?: Sync;
  logger?: PlyrLogger;
}

declare class Player extends SvelteComponentTyped<PlayerProps> {}
export default Player;
