export interface RecoverableSlide<State> {
  release: (callback: () => void) => void;
  setSlideState: (state: State) => Promise<void>;
}

export async function releaseAndRestoreSlide<State>(
  slide: RecoverableSlide<State>,
  getLatestState: () => State | null | undefined,
  onRestore?: (state: State) => void
): Promise<void> {
  await new Promise<void>(resolve => slide.release(resolve));
  const state = getLatestState();
  if (state) {
    onRestore?.(state);
    await slide.setSlideState(state);
  }
}
