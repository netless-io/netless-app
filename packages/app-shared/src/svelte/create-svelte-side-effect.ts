import { onDestroy } from "svelte";
import { SideEffectManager } from "side-effect-manager";

export function createSvelteSideEffect(): SideEffectManager {
  const sideEffect = new SideEffectManager();

  onDestroy(() => sideEffect.flushAll());

  return sideEffect;
}
