import type { ReadonlyTeleBox } from "@netless/window-manager";

import { SideEffectManager } from "side-effect-manager";
import { withValueEnhancer, type ReadonlyVal, Val, type ValEnhancedResult } from "value-enhancer";
import type { DocsViewerEventData, DocsViewerPage } from "./typings";
import { Preview } from "./Preview";
import { Footer } from "./Footer";
import { Remitter } from "remitter";

export * from "./typings";

export type ValConfig = {
  pages: Val<DocsViewerPage[]>;
};

export interface DocsViewer extends ValEnhancedResult<ValConfig> {}

export interface DocsViewerConfig {
  readonly$: ReadonlyVal<boolean>;
  pagesIndex$: ReadonlyVal<number>;
  pages?: DocsViewerPage[];
  box: ReadonlyTeleBox;
  playable: boolean;
}

export class DocsViewer {
  public constructor({ readonly$, pagesIndex$, box, pages = [], playable }: DocsViewerConfig) {
    const pages$ = new Val(pages);

    withValueEnhancer(this, {
      pages: pages$,
    });

    this.preview = new Preview({
      pages$,
      readonly$,
      pagesIndex$,
      root: box.$body,
      sideEffect: this.sideEffect,
      events: this.events,
      namespace: this.namespace,
      wrapClassName: this.wrapClassName,
    });

    this.footer = new Footer({
      pages$,
      readonly$,
      playable,
      pagesIndex$,
      root: box.$footer,
      namespace: this.namespace,
      sideEffect: this.sideEffect,
      events: this.events,
      wrapClassName: this.wrapClassName,
    });
  }

  public preview: Preview;
  public footer: Footer;

  public destroy(): void {
    this.preview.destroy();
    this.footer.destroy();
    this.sideEffect.flushAll();
    this.events.destroy();
  }

  private wrapClassName = (className: string): string => {
    return `${this.namespace}-${className}`;
  };

  public readonly namespace = "netless-app-docs-viewer";

  private readonly sideEffect = new SideEffectManager();

  public readonly events = new Remitter<DocsViewerEventData>();
}
