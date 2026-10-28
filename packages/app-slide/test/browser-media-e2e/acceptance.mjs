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

// Reload may cancel the previous document request in WebKit. Only classify that
// exact main-frame navigation while the harness explicitly awaits its reload.
const expectedReloads = new WeakMap();
export async function reloadForAcceptance(page) {
  expectedReloads.set(page, page.url());
  try {
    return await page.reload();
  } finally {
    expectedReloads.delete(page);
  }
}

export function isExpectedReloadCancellation(page, request) {
  const url = expectedReloads.get(page);
  return Boolean(
    url &&
      request.url() === url &&
      request.failure()?.errorText === "cancelled" &&
      request.resourceType() === "document" &&
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame()
  );
}
