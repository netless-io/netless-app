import { onDestroy } from "svelte";
import { SideEffectManager } from "../SideEffectManager";

export function createSvelteSideEffect(): SideEffectManager {
  const sideEffect = new SideEffectManager();

  onDestroy(() => sideEffect.flush());

  return sideEffect;
}
