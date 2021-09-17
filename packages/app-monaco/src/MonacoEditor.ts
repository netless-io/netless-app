import type { AppContext, ReadonlyTeleBox } from "@netless/window-manager";
import type { Text } from "yjs";
import { Doc } from "yjs";
import type { NetlessAppMonacoAttributes } from "./typings";
import { editor as monacoEditor } from "monaco-editor";
import { YMonaco } from "./y-monaco";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker&inline";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker&inline";

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
  public readonly $container: HTMLDivElement;
  public readonly yDoc: Doc;
  public readonly yText: Text;

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

    this.editor = monacoEditor.create(this.$container, {
      value: "",
      automaticLayout: true,
      readOnly: readonly,
      language: "javascript",
      fixedOverflowWidgets: false,
    });

    this.yBinding = new YMonaco(context, attrs, box, this.editor, this.yDoc, this.yText, readonly);
  }

  public setReadonly(readonly: boolean): void {
    if (readonly !== this.readonly) {
      this.readonly = readonly;
      this.$container.classList.toggle("netless-app-monaco-cursor-readonly", readonly);
      this.editor.updateOptions({ readOnly: readonly });
      this.yBinding.setReadonly(readonly);
    }
  }

  private renderContainer(): HTMLDivElement {
    const $container = document.createElement("div");
    $container.className = "netless-app-monaco-editor-container";
    this.box.$content?.appendChild($container);

    if (this.readonly) {
      $container.classList.add("netless-app-monaco-cursor-readonly");
    }

    return $container;
  }

  // private renderFooter(): HTMLDivElement {

  // }

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

  public destroy(): void {
    this.editor.dispose();
  }
}
