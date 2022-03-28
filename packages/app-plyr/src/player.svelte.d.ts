import type { AppContext } from "@netless/window-manager";
import type { Attributes } from ".";
import type { Sync } from "./sync";

import { SvelteComponentTyped } from "svelte";

export declare interface PlayerProps {
  storage?: AppContext<Attributes>["storage"];
  sync?: Sync;
}

declare class Player extends SvelteComponentTyped<PlayerProps> {}
export default Player;
