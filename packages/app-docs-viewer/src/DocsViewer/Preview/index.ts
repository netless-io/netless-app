import type { SideEffectManager } from "side-effect-manager";
import { Val, type ReadonlyVal } from "value-enhancer";
import type { DocsViewerEvents, DocsViewerPage } from "../typings";
import LazyLoad, { type ILazyLoadInstance } from "vanilla-lazyload";

export interface PreviewConfig {
  readonly namespace: string;
  readonly pages$: ReadonlyVal<DocsViewerPage[]>;
  readonly sideEffect: SideEffectManager;
  readonly readonly$: ReadonlyVal<boolean>;
  readonly events: DocsViewerEvents;
  readonly wrapClassName: (className: string) => string;
  readonly root: HTMLElement;
  readonly pagesIndex$: ReadonlyVal<number>;
}
export class Preview {
  readonly namespace: PreviewConfig["namespace"];
  readonly pages$: PreviewConfig["pages$"];
  readonly sideEffect: PreviewConfig["sideEffect"];
  readonly readonly$: PreviewConfig["readonly$"];
  readonly events: PreviewConfig["events"];
  readonly wrapClassName: PreviewConfig["wrapClassName"];

  readonly showPreview$ = new Val(false);

  public $preview?: HTMLElement;
  public $previewMask?: HTMLElement;

  private previewLazyLoad?: ILazyLoadInstance;

  public constructor({
    namespace,
    pages$,
    sideEffect,
    readonly$,
    events,
    wrapClassName,
    root,
    pagesIndex$,
  }: PreviewConfig) {
    this.namespace = namespace;
    this.pages$ = pages$;
    this.sideEffect = sideEffect;
    this.readonly$ = readonly$;
    this.events = events;
    this.wrapClassName = wrapClassName;

    this.sideEffect.addDisposer(
      this.events.on("togglePreview", () => {
        this.showPreview$.setValue(!this.showPreview$.value);
      })
    );

    this.sideEffect.addDisposer(
      this.showPreview$.subscribe(showPreview => {
        this.sideEffect.add(() => {
          const $preview = this.renderPreview();
          const $previewMask = this.renderPreviewMask();
          if (showPreview) {
            root.appendChild($preview);
            root.appendChild($previewMask);
            $preview.scrollTop;

            const $previewPage = $preview.querySelector<HTMLElement>(
              "." + this.wrapClassName(`preview-page-${pagesIndex$.value}`)
            );
            if ($previewPage) {
              $preview.scrollTo({
                top: $previewPage.offsetTop - 16,
              });
            }

            $preview.classList.toggle(this.wrapClassName("preview-active"), true);

            this.previewLazyLoad = new LazyLoad({
              container: this.$preview,
              elements_selector: "." + this.wrapClassName("preview-page>img"),
            });
            return () => this.previewLazyLoad?.destroy();
          } else {
            $preview.classList.toggle(this.wrapClassName("preview-active"), false);
            this.sideEffect.setTimeout(
              () => {
                $preview.remove();
                $previewMask.remove();
              },
              500,
              "preview-remove"
            );
            return null;
          }
        }, "preview-lazyload");
      })
    );
  }

  public destroy(): void {
    this.$preview?.remove();
    this.$previewMask?.remove();
  }

  private renderPreview(): HTMLElement {
    if (this.$preview) {
      return this.$preview;
    }

    const $preview = document.createElement("div");
    $preview.className = this.wrapClassName("preview") + " tele-fancy-scrollbar";
    this.$preview = $preview;

    this.sideEffect.addEventListener($preview, "wheel", ev => ev.stopPropagation(), {
      passive: false,
    });

    this.sideEffect.addDisposer(
      this.pages$.subscribe(pages => {
        this.sideEffect.add(() => {
          const $pages = pages.map((page, i) => {
            const previewSRC = page.thumbnail ?? (page.src.startsWith("ppt") ? void 0 : page.src);
            if (!previewSRC) {
              return;
            }

            const pageIndex = String(i);

            const $page = document.createElement("a");
            $page.className =
              this.wrapClassName("preview-page") + " " + this.wrapClassName(`preview-page-${i}`);
            $page.setAttribute("href", "#");
            $page.dataset.pageIndex = pageIndex;

            const $name = document.createElement("span");
            $name.className = this.wrapClassName("preview-page-name");
            $name.textContent = String(i + 1);
            $name.dataset.pageIndex = pageIndex;

            const $img = document.createElement("img");
            $img.width = page.width;
            $img.height = page.height;
            $img.dataset.src = previewSRC;
            $img.dataset.pageIndex = pageIndex;

            $page.appendChild($img);
            $page.appendChild($name);
            $preview.appendChild($page);

            return $page;
          });
          return () => $pages.forEach($page => $page?.remove());
        }, "render-preview-pages");
        this.previewLazyLoad?.update();
      })
    );

    this.sideEffect.addEventListener($preview, "click", ev => {
      if (this.readonly$.value) return;
      const pageIndex = (ev.target as HTMLElement).dataset?.pageIndex;
      if (pageIndex) {
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation();
        this.events.emit("jumpPage", Number(pageIndex));
        this.showPreview$.setValue(false);
      }
    });

    return $preview;
  }

  private renderPreviewMask(): HTMLElement {
    if (this.$previewMask) {
      return this.$previewMask;
    }
    const $previewMask = document.createElement("div");
    $previewMask.className = this.wrapClassName("preview-mask");
    this.$previewMask = $previewMask;
    this.sideEffect.addEventListener($previewMask, "click", ev => {
      if (this.readonly$.value) return;
      if (ev.target === $previewMask) {
        this.showPreview$.setValue(false);
      }
    });
    return $previewMask;
  }
}
