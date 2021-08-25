import type Plyr from "plyr";

/**
 * Return `true` means ok, `false` means some error occurs.
 */
export async function safePlay(player: Plyr): Promise<boolean> {
  try {
    await player.play();
    return true;
  } catch (err) {
    player.muted = true;
    await player.play();
    console.debug(err);
    return false;
  }
}
