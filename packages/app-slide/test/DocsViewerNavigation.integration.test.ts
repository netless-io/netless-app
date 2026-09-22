import { DocsViewer } from "../src/DocsViewer";
import {
  navigateWithNavigationButton,
  resolveNavigationButtonMode,
} from "../src/SlideDocsViewer/navigation";

type Listener = (event: {
  target: FakeElement;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}) => void;

class FakeClassList {
  private readonly values = new Set<string>();

  public add(...names: string[]): void {
    names.forEach(name => this.values.add(name));
  }

  public toggle(name: string, force?: boolean): void {
    if (force === true || (force === undefined && !this.values.has(name))) {
      this.values.add(name);
    } else if (force === false || this.values.has(name)) {
      this.values.delete(name);
    }
  }

  public contains(name: string): boolean {
    return this.values.has(name);
  }
}

class FakeElement {
  public className = "";
  public readonly classList = new FakeClassList();
  public readonly children: FakeElement[] = [];
  public readonly dataset: Record<string, string> = {};
  public readonly listeners = new Map<string, Listener[]>();
  public readonly style: Record<string, string> = {};
  public parentElement: FakeElement | null = null;
  public textContent = "";
  public value = "";
  public disabled = false;

  public constructor(public readonly tagName: string) {}

  public get firstChild(): FakeElement | undefined {
    return this.children[0];
  }

  public appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  public remove(): void {
    if (this.parentElement) {
      this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
    }
  }

  public addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  public removeEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      listeners.filter(item => item !== listener)
    );
  }

  public dispatchEvent(type: string): void {
    const event = {
      target: this,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
      stopImmediatePropagation: () => undefined,
    };
    (this.listeners.get(type) || []).forEach(listener => listener(event));
  }

  public click(): void {
    this.dispatchEvent("click");
  }

  public focus(): void {
    this.dispatchEvent("focus");
  }

  public select(): void {
    // no-op for the input shim
  }

  public setAttribute(name: string, value: string): void {
    if (name === "class") this.className = value;
  }

  public querySelector(selector: string): FakeElement | null {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    for (const child of this.children) {
      if (className && child.className.split(" ").includes(className)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  public scrollTo(): void {
    // no-op for the layout shim
  }
}

const fakeDocument = {
  createElement: (tagName: string) => new FakeElement(tagName),
  createElementNS: (_namespace: string, tagName: string) => new FakeElement(tagName),
};

(globalThis as { document?: typeof fakeDocument }).document = fakeDocument;

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function createViewerHarness(mode: "page" | "step", readonly = false) {
  const calls: string[] = [];
  const controller = {
    page: 2,
    slide: {
      prevStep: () => calls.push("prevStep"),
      nextStep: () => calls.push("nextStep"),
    },
    jumpToPage: (page: number, origin?: string) => calls.push(`jumpToPage:${page}:${origin}`),
  };
  const viewer = new DocsViewer({
    readonly,
    onNewPageIndex: (index, origin) =>
      navigateWithNavigationButton(
        mode,
        origin,
        viewer.pageIndex,
        index,
        controller,
        (page, nextOrigin) => calls.push(`onNavigate:${page}:${nextOrigin}`)
      ),
  });
  viewer.setPageIndex(1);
  return { calls, viewer };
}

function clickFooterButton(viewer: DocsViewer, button: "back" | "next"): void {
  const className = button === "back" ? "btn-page-back" : "btn-page-next";
  const element = viewer.$footer.querySelector(`.netless-app-slide-${className}`);
  if (!element) throw new Error(`missing footer button: ${button}`);
  element.click();
}

const pageHarness = createViewerHarness(resolveNavigationButtonMode(undefined));
clickFooterButton(pageHarness.viewer, "next");
assertEqual(
  JSON.stringify(pageHarness.calls),
  JSON.stringify(["jumpToPage:3:navigation"]),
  "default footer next button uses page navigation"
);

const stepHarness = createViewerHarness("step");
clickFooterButton(stepHarness.viewer, "next");
clickFooterButton(stepHarness.viewer, "back");
assertEqual(
  JSON.stringify(stepHarness.calls),
  JSON.stringify(["nextStep", "onNavigate:2:navigation", "prevStep", "onNavigate:2:navigation"]),
  "step footer buttons call the matching step methods"
);

const edgeHarness = createViewerHarness("step");
edgeHarness.viewer.setPageIndex(0);
clickFooterButton(edgeHarness.viewer, "back");
edgeHarness.viewer.setPageIndex(24);
clickFooterButton(edgeHarness.viewer, "next");
assertEqual(
  JSON.stringify(edgeHarness.calls),
  JSON.stringify(["prevStep", "onNavigate:2:navigation", "nextStep", "onNavigate:2:navigation"]),
  "step footer buttons preserve Slide boundary handling"
);

const readonlyHarness = createViewerHarness("step", true);
clickFooterButton(readonlyHarness.viewer, "next");
assertEqual(
  JSON.stringify(readonlyHarness.calls),
  JSON.stringify([]),
  "readonly footer does not navigate"
);

const inputHarness = createViewerHarness("step");
inputHarness.viewer.$pageNumberInput.value = "3";
inputHarness.viewer.$pageNumberInput.dispatchEvent("change");
assertEqual(
  JSON.stringify(inputHarness.calls),
  JSON.stringify(["jumpToPage:3:input"]),
  "step mode keeps page number input on direct page navigation"
);
