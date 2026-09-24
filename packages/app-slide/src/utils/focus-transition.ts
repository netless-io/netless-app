export type FocusTransitionHandler = (isFocused: boolean) => void | Promise<void>;

export function shouldSlideRuntimeBeActive(
  isFocused: boolean,
  isVisible: boolean,
  isMinimized: boolean
): boolean {
  return isFocused && isVisible && !isMinimized;
}

/**
 * Drops duplicate focus states and serializes opposite resource transitions.
 * The state tracks accepted events so an in-flight async transition cannot be
 * started twice by duplicate host signals.
 */
export function createFocusTransitionQueue(
  initialState: boolean | undefined,
  apply: FocusTransitionHandler,
  onError?: (error: unknown) => void
): (isFocused: boolean, force?: boolean) => Promise<void> {
  let acceptedState = initialState;
  let revision = 0;
  let queue = Promise.resolve();
  let acceptedPromise = Promise.resolve();

  return (isFocused, force = false) => {
    // A duplicate signal must observe the same completion barrier. Returning
    // early here would let the host commit focus while freeze/unfreeze is
    // still running.
    if (!force && isFocused === acceptedState) return acceptedPromise;
    acceptedState = isFocused;
    const transitionRevision = ++revision;
    const transition = queue
      .then(() => apply(isFocused))
      .catch(error => {
        // Permit a later same-state signal to retry only when no newer focus
        // transition has superseded the failed request.
        if (revision === transitionRevision) {
          acceptedState = undefined;
          acceptedPromise = Promise.resolve();
        }
        onError?.(error);
        throw error;
      });
    // Keep later opposite transitions runnable after a failure, while the
    // caller still receives the rejection for this exact transition.
    queue = transition.catch(() => undefined);
    acceptedPromise = transition;
    return transition;
  };
}
