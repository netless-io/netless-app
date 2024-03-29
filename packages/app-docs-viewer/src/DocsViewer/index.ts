import { SideEffectManager } from "side-effect-manager";
import type { Val, ReadonlyVal, ValEnhancedResult } from "value-enhancer";
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
  pages$: ReadonlyVal<DocsViewerPage[]>;
  previewRoot: HTMLElement;
  footerRoot: HTMLElement;
  playable: boolean;
}

export class DocsViewer {
  public constructor({
    readonly$,
    pagesIndex$,
    previewRoot,
    footerRoot,
    pages$,
    playable,
  }: DocsViewerConfig) {
    this.preview = new Preview({
      pages$,
      readonly$,
      pagesIndex$,
      root: previewRoot,
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
      root: footerRoot,
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
