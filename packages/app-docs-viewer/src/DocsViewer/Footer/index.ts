import { sidebarSVG } from "../icons/sidebar";
import { arrowLeftSVG } from "../icons/arrow-left";
import { arrowRightSVG } from "../icons/arrow-right";
import { playSVG } from "../icons/play";
import { pauseSVG } from "../icons/pause";
import { saveSVG } from "../icons/save";
import { spinnerSVG } from "../icons/spinner";

import type { SideEffectManager } from "side-effect-manager";
import type { ReadonlyVal } from "value-enhancer";
import type { DocsViewerEvents, DocsViewerPage } from "../typings";

export interface FooterConfig {
  readonly namespace: string;
  readonly pages$: ReadonlyVal<DocsViewerPage[]>;
  readonly sideEffect: SideEffectManager;
  readonly readonly$: ReadonlyVal<boolean>;
  readonly events: DocsViewerEvents;
  readonly playable: boolean;
  readonly wrapClassName: (className: string) => string;

  readonly pagesIndex$: ReadonlyVal<number>;
  readonly root: HTMLElement;
}

export class Footer {
  readonly namespace: FooterConfig["namespace"];
  readonly pages$: FooterConfig["pages$"];
  readonly sideEffect: FooterConfig["sideEffect"];
  readonly readonly$: FooterConfig["readonly$"];
  readonly events: FooterConfig["events"];
  readonly playable: boolean;
  readonly wrapClassName: FooterConfig["wrapClassName"];

  readonly pagesIndex$: FooterConfig["pagesIndex$"];

  $footer: HTMLElement;

  constructor({
    namespace,
    pages$,
    sideEffect,
    readonly$,
    events,
    playable,
    wrapClassName,
    pagesIndex$,
    root,
  }: FooterConfig) {
    this.namespace = namespace;
    this.pages$ = pages$;
    this.sideEffect = sideEffect;
    this.readonly$ = readonly$;
    this.events = events;
    this.wrapClassName = wrapClassName;

    this.pagesIndex$ = pagesIndex$;

    this.playable = playable;

    this.$footer = this.render();

    root.appendChild(this.$footer);
  }

  public destroy(): void {
    this.$footer.remove();
  }

  private render(): HTMLElement {
    const $footer = document.createElement("div");
    $footer.className = this.wrapClassName("footer");

    this.sideEffect.addDisposer(
      this.readonly$.subscribe(readonly =>
        $footer.classList.toggle(this.wrapClassName("readonly"), readonly)
      )
    );

    const $btnSidebar = this.renderFooterBtn("btn-sidebar", sidebarSVG(this.namespace));
    this.sideEffect.addEventListener($btnSidebar, "click", () => {
      if (this.readonly$.value) return;
      this.events.emit("togglePreview");
    });
    $footer.appendChild($btnSidebar);

    this.sideEffect.addDisposer(
      this.pages$.subscribe(pages => {
        const hasPreview = pages.some(page => page.thumbnail || !page.src.startsWith("ppt"));
        $btnSidebar.style.display = hasPreview ? "" : "none";
      })
    );

    const $pageJumps = document.createElement("div");
    $pageJumps.className = this.wrapClassName("page-jumps");

    const $btnPageBack = this.renderFooterBtn("btn-page-back", arrowLeftSVG(this.namespace));
    this.sideEffect.addEventListener($btnPageBack, "click", () => {
      if (this.readonly$.value) return;
      this.events.emit("back");
    });
    $pageJumps.appendChild($btnPageBack);

    if (this.playable) {
      const $btnPlay = this.renderFooterBtn(
        "btn-page-play",
        playSVG(this.namespace),
        pauseSVG(this.namespace)
      );
      this.sideEffect.addEventListener($btnPlay, "click", () => {
        if (this.readonly$.value) return;
        $btnPlay.classList.toggle(this.wrapClassName("footer-btn-playing"), true);
        this.events.emit("play");
        this.sideEffect.setTimeout(
          () => $btnPlay.classList.toggle(this.wrapClassName("footer-btn-playing"), false),
          500,
          "returnPlay"
        );
      });

      $pageJumps.appendChild($btnPlay);
    }

    const $btnPageNext = this.renderFooterBtn("btn-page-next", arrowRightSVG(this.namespace));
    this.sideEffect.addEventListener($btnPageNext, "click", () => {
      if (this.readonly$.value) return;
      this.events.emit("next");
    });
    $pageJumps.appendChild($btnPageNext);

    const $pageNumber = document.createElement("div");
    $pageNumber.className = this.wrapClassName("page-number");

    const $pageNumberInput = document.createElement("input");
    $pageNumberInput.className = this.wrapClassName("page-number-input");
    this.sideEffect.addDisposer(
      this.readonly$.subscribe(readonly => ($pageNumberInput.disabled = readonly))
    );
    this.sideEffect.addDisposer(
      this.pagesIndex$.subscribe(pagesIndex => ($pageNumberInput.value = String(pagesIndex + 1)))
    );
    this.sideEffect.addEventListener($pageNumberInput, "blur", () => {
      // Workaround for Safari keyboard folding
      $pageNumberInput.value = String(this.pagesIndex$.value + 1);
    });
    this.sideEffect.addEventListener($pageNumberInput, "change", () => {
      if (this.readonly$.value) return;
      const pageIndex = $pageNumberInput.value ? Number($pageNumberInput.value) - 1 : NaN;
      if (pageIndex >= 0) {
        this.events.emit("jumpPage", pageIndex);
      } else {
        $pageNumberInput.value = String(this.pagesIndex$.value + 1);
      }
    });

    const $totalPage = document.createElement("span");
    this.sideEffect.addDisposer(
      this.pages$.subscribe(pages => {
        $totalPage.textContent = " / " + pages.length;
      })
    );

    $pageNumber.appendChild($pageNumberInput);
    $pageNumber.appendChild($totalPage);

    $footer.appendChild($pageJumps);
    $footer.appendChild($pageNumber);

    const saveIcon = saveSVG(this.namespace);
    const spinnerIcon = spinnerSVG(this.namespace);
    spinnerIcon.style.display = "none";
    const $saveBtn = document.createElement("button");
    $saveBtn.className = this.wrapClassName("footer-btn");
    $saveBtn.appendChild(saveIcon);
    $saveBtn.appendChild(spinnerIcon);

    $footer.appendChild($saveBtn);
    this.sideEffect.addEventListener($saveBtn, "click", () => {
      this.events.emit("save");
    });
    this.events.on("saveProgress", (p: number) => {
      if (p < 99) {
        spinnerIcon.style.display = "block";
        saveIcon.style.display = "none";
        const progress = spinnerIcon.querySelector("[data-id]");
        if (progress) {
          progress.textContent = p.toString().padStart(2, "0");
        }
      } else {
        spinnerIcon.style.display = "none";
        saveIcon.style.display = "block";
      }
    });

    return $footer;
  }

  private renderFooterBtn(
    className: string,
    $icon: SVGElement,
    $iconActive?: SVGElement
  ): HTMLButtonElement {
    const $btn = document.createElement("button");
    $btn.className = this.wrapClassName("footer-btn") + " " + this.wrapClassName(className);

    $btn.appendChild($icon);

    if ($iconActive) {
      $btn.appendChild($iconActive);
    }

    return $btn;
  }
}
