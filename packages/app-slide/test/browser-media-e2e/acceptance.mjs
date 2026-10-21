export const PAUSED_POSITION_TOLERANCE_SECONDS = 2;

export function matchesPausedPosition(actual, sharedTarget, trimStart = 0) {
  return (
    Number.isFinite(actual) &&
    Number.isFinite(sharedTarget) &&
    Number.isFinite(trimStart) &&
    Math.abs(actual - (sharedTarget + trimStart)) <= PAUSED_POSITION_TOLERANCE_SECONDS
  );
}
