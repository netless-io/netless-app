export const PAUSED_POSITION_TOLERANCE_SECONDS = 2;
export const GRAPHICS_CONTEXT_POLICY = "functional-impact";

export function isGraphicsContextNotice(message) {
  return (
    typeof message === "string" &&
    (/^There are too many active WebGL contexts on this page, the oldest context will be lost\.?$/.test(
      message
    ) ||
      /^WebGL: INVALID_OPERATION: loseContext: context already lost\.?$/.test(message) ||
      /^WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost\.?$/.test(message) ||
      /^(?:WebGL|THREE\.WebGLRenderer|PIXI(?:\.Renderer)?): [Cc]ontext [Ll]ost\.?$/.test(message))
  );
}

export function matchesPausedPosition(actual, sharedTarget, trimStart = 0) {
  return (
    Number.isFinite(actual) &&
    Number.isFinite(sharedTarget) &&
    Number.isFinite(trimStart) &&
    Math.abs(actual - (sharedTarget + trimStart)) <= PAUSED_POSITION_TOLERANCE_SECONDS
  );
}
