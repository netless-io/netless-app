import type { AppContext, ReadonlyTeleBox } from "@netless/window-manager";
import type { Text } from "yjs";
import { Doc } from "yjs";
import type { NetlessAppMonacoAttributes } from "./typings";
import { editor as monacoEditor, languages } from "monaco-editor";
import { YMonaco } from "./y-monaco";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker&inline";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline";
import { SideEffectManager } from "side-effect-manager";

declare global {
  interface Window {
    MonacoEnvironment: {
      getWorker: (_: string, label: string) => Worker;
    };
  }
}

export class MonacoEditor {
  public readonly editor: monacoEditor.IStandaloneCodeEditor;
  public readonly yBinding: YMonaco;
  public readonly yDoc: Doc;
  public readonly yText: Text;

  public readonly $container: HTMLDivElement;
  public readonly $footer: HTMLDivElement;

  public constructor(
    public context: AppContext<NetlessAppMonacoAttributes>,
    public attrs: NetlessAppMonacoAttributes,
    public box: ReadonlyTeleBox,
    public readonly: boolean
  ) {
    this.setupMonacoEnv();

    this.yDoc = new Doc();
    this.yText = this.yDoc.getText("monaco");

    this.$container = this.renderContainer();
    this.box.mountContent(this.$container);

    this.editor = monacoEditor.create(this.$container, {
      value: "",
      automaticLayout: true,
      readOnly: readonly,
      language: this.attrs.lang,
      fixedOverflowWidgets: false,
    });

    // set footer after editor creation
    this.$footer = this.renderFooter();
    this.box.mountFooter(this.$footer);

    this.yBinding = new YMonaco(context, attrs, box, this.editor, this.yDoc, this.yText, readonly);
  }

  public setReadonly(readonly: boolean): void {
    if (readonly !== this.readonly) {
      this.readonly = readonly;
      this.$container.classList.toggle(this.wrapClassName("cursor-readonly"), readonly);
      this.$footer.classList.toggle(this.wrapClassName("readonly"), readonly);
      this.editor.updateOptions({ readOnly: readonly });
      this.yBinding.setReadonly(readonly);
    }
  }

  private renderContainer(): HTMLDivElement {
    const $container = document.createElement("div");
    $container.className = this.wrapClassName("editor-container");

    if (this.readonly) {
      $container.classList.add(this.wrapClassName("cursor-readonly"));
    }

    return $container;
  }

  private renderFooter(): HTMLDivElement {
    const $footer = document.createElement("div");
    $footer.className = this.wrapClassName("footer");

    if (this.readonly) {
      $footer.classList.add(this.wrapClassName("readonly"));
    }

    const $langSelect = document.createElement("select");
    $langSelect.className = this.wrapClassName("lang-select");

    languages.getLanguages().forEach(lang => {
      const opt = document.createElement("option");
      opt.value = lang.id;
      opt.textContent = lang.id;
      $langSelect.appendChild(opt);
    });

    $langSelect.value = this.attrs.lang;
    $footer.appendChild($langSelect);

    this.sideEffect.addEventListener($langSelect, "change", () => {
      const lang = $langSelect.value;
      if (!this.readonly && lang && lang !== this.attrs.lang) {
        this.context.updateAttributes(["lang"], lang);
      }
    });

    this.sideEffect.add(() =>
      this.context.mobxUtils.reaction(
        () => this.attrs.lang,
        lang => {
          if (lang) {
            monacoEditor.setModelLanguage(this.yBinding.monacoModel, lang);
            $langSelect.value = lang;
          }
        }
      )
    );

    return $footer;
  }

  private setupMonacoEnv(): void {
    if (!self.MonacoEnvironment) {
      self.MonacoEnvironment = {
        getWorker(_: unknown, label: string): Worker {
          switch (label) {
            case "javascript":
            case "typescript": {
              return new tsWorker();
            }
            default: {
              return new editorWorker();
            }
          }
        },
      };
    }
  }

  public wrapClassName(className: string): string {
    return `netless-app-monaco-${className}`;
  }

  public destroy(): void {
    this.editor.dispose();
  }

  private sideEffect = new SideEffectManager();
}
