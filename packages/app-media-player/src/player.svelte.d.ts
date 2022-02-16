import { SvelteComponentTyped } from "svelte";

export declare interface PlayerProps {
  src: string;
  type?: string;
  poster?: string;
  provider?: "youtube" | "vimeo";
  volume?: number;
  muted?: boolean;
  paused?: boolean;
  currentTime?: number;
}

export declare interface PlayerEvents {
  "update:attrs": CustomEvent<{
    paused?: boolean;
    currentTime?: number;
    muted?: boolean;
    volume?: number;
  }>;
}

declare class Player extends SvelteComponentTyped<PlayerProps, PlayerEvents> {}
export default Player;
