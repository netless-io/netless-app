import type { Doc } from "yjs";
import { createAbsolutePositionFromRelativePosition, createRelativePositionFromJSON } from "yjs";
import type * as Monaco from "monaco-editor";
import type { StyleManager } from "./StyleManager";

export class SelectionDecorations {
  public rawSelectionsStr?: string;
  public selections?: Array<{ start: unknown; end: unknown }>;

  public styleRule: CSSStyleRule | null | undefined;

  public readonly selectionClassName: string;

  public constructor(
    public doc: Doc,
    public monaco: typeof Monaco,
    public monacoEditor: Monaco.editor.IStandaloneCodeEditor,
    public monacoModel: Monaco.editor.ITextModel,
    public useID: string,
    public selectionColor: string,
    public styleManager: StyleManager
  ) {
    this.selectionClassName = `netless-app-monaco-selection-${this.useID}`;

    this.styleRule = this.styleManager.addRule(
      `.${this.selectionClassName} { background: ${selectionColor}; }`
    );
  }

  public setSelections(rawSelectionsStr?: string): void {
    if (rawSelectionsStr === this.rawSelectionsStr) {
      return;
    }
    this.rawSelectionsStr = rawSelectionsStr;

    this.selections = void 0;
    if (this.rawSelectionsStr) {
      try {
        const selections = JSON.parse(this.rawSelectionsStr);
        if (Array.isArray(selections)) {
          this.selections = selections;
        }
      } catch (e) {
        console.warn(e);
      }
    }
  }

  public renderSelections(): Monaco.editor.IModelDeltaDecoration[] {
    const selectionDecorations: Monaco.editor.IModelDeltaDecoration[] = [];
    if (this.selections && !this.monacoModel.isDisposed()) {
      this.selections.forEach(selection => {
        if (selection.start && selection.end) {
          const startAbs = createAbsolutePositionFromRelativePosition(
            createRelativePositionFromJSON(selection.start),
            this.doc
          );
          const endAbs = createAbsolutePositionFromRelativePosition(
            createRelativePositionFromJSON(selection.end),
            this.doc
          );
          if (startAbs && endAbs) {
            const posStart = this.monacoModel.getPositionAt(startAbs.index);
            const posEnd = this.monacoModel.getPositionAt(endAbs.index);
            selectionDecorations.push({
              range: new this.monaco.Range(
                posStart.lineNumber,
                posStart.column,
                posEnd.lineNumber,
                posEnd.column
              ),
              options: {
                zIndex: -1,
                className: `netless-app-monaco-selection ${this.selectionClassName}`,
              },
            });
          }
        }
      });
    }
    return selectionDecorations;
  }

  public destroy(): void {
    if (this.styleRule) {
      this.styleManager.deleteRule(this.styleRule);
    }
  }

  private selectionDecorations: string[] = [];
}
