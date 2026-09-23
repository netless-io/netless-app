import type { NavigationButtonMode } from "..";

export type NavigationButtonAction = "prevStep" | "nextStep";

export function resolveNavigationButtonMode(
  mode: NavigationButtonMode | undefined
): NavigationButtonMode {
  return mode ?? "page";
}

interface NavigationController {
  readonly page: number;
  readonly slide: Record<NavigationButtonAction, () => void>;
  jumpToPage(page: number, origin?: string): void;
}

export function navigateWithNavigationButton(
  mode: NavigationButtonMode,
  origin: string | undefined,
  currentPageIndex: number,
  targetPageIndex: number,
  controller: NavigationController,
  onNavigate: (page: number, origin?: string) => void
): void {
  if (mode === "step" && origin === "navigation") {
    const action: NavigationButtonAction =
      targetPageIndex < currentPageIndex ? "prevStep" : "nextStep";
    controller.slide[action]();
    onNavigate(controller.page, origin);
    return;
  }
  controller.jumpToPage(targetPageIndex + 1, origin);
}
