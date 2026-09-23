import {
  navigateWithNavigationButton,
  resolveNavigationButtonMode,
} from "../src/SlideDocsViewer/navigation";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function testNavigation(
  mode: "page" | "step",
  origin: string,
  currentPageIndex: number,
  targetPageIndex: number
): string[] {
  const calls: string[] = [];
  const controller = {
    page: currentPageIndex + 1,
    slide: {
      prevStep: () => calls.push("prevStep"),
      nextStep: () => calls.push("nextStep"),
    },
    jumpToPage: (page: number, nextOrigin?: string) =>
      calls.push(`jumpToPage:${page}:${nextOrigin}`),
  };

  navigateWithNavigationButton(
    mode,
    origin,
    currentPageIndex,
    targetPageIndex,
    controller,
    (page, nextOrigin) => calls.push(`onNavigate:${page}:${nextOrigin}`)
  );
  return calls;
}

assertEqual(
  JSON.stringify(testNavigation(resolveNavigationButtonMode(undefined), "navigation", 2, 3)),
  JSON.stringify(["jumpToPage:4:navigation"]),
  "missing configuration defaults to page mode and calls only jumpToPage"
);
assertEqual(
  JSON.stringify(testNavigation("step", "preview", 2, 3)),
  JSON.stringify(["jumpToPage:4:preview"]),
  "step mode keeps preview navigation on jumpToPage"
);
assertEqual(
  JSON.stringify(testNavigation("step", "navigation", 2, 1)),
  JSON.stringify(["prevStep", "onNavigate:3:navigation"]),
  "step mode calls only prevStep for the previous button"
);
assertEqual(
  JSON.stringify(testNavigation("step", "navigation", 2, 3)),
  JSON.stringify(["nextStep", "onNavigate:3:navigation"]),
  "step mode calls only nextStep for the next button"
);
