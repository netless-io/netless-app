import type { Doc } from "yjs";
import { createAbsolutePositionFromRelativePosition, createRelativePositionFromJSON } from "yjs";
import type { editor } from "monaco-editor";
import { Range } from "monaco-editor";
import type { StyleManager } from "./StyleManager";

export class SelectionDecoration {
  public rawSelectionStr?: string;

  public styleRule: CSSStyleRule | null | undefined;

  public readonly selectionClassName: string;

  public constructor(
    public doc: Doc,
    public monacoEditor: editor.IStandaloneCodeEditor,
    public monacoModel: editor.ITextModel,
    public decorationID: number,
    public selectionColor: string,
    public styleManager: StyleManager
  ) {
    this.selectionClassName = `netless-app-monaco-selection-${this.decorationID}`;

    this.styleRule = this.styleManager.addRule(
      `.${this.selectionClassName} { background: ${selectionColor}; }`
    );
  }

  public setSelection(rawSelectionStr?: string): void {
    if (rawSelectionStr === this.rawSelectionStr) {
      return;
    }

    this.rawSelectionStr = rawSelectionStr;

    if (rawSelectionStr) {
      try {
        const selection = JSON.parse(rawSelectionStr);
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
            const selectionDecorations = [
              {
                range: new Range(
                  posStart.lineNumber,
                  posStart.column,
                  posEnd.lineNumber,
                  posEnd.column
                ),
                options: {
                  zIndex: -1,
                  className: `netless-app-monaco-selection ${this.selectionClassName}`,
                },
              },
            ];
            this.selectionDecorations = this.monacoEditor.deltaDecorations(
              this.selectionDecorations,
              selectionDecorations
            );
            return;
          }
        }
      } catch (e) {
        console.warn(e);
      }
    }

    this.clearSelections();
  }

  public clearSelections(): void {
    this.selectionDecorations = this.monacoEditor.deltaDecorations(this.selectionDecorations, []);
  }

  public destroy(): void {
    this.clearSelections();
    if (this.styleRule) {
      this.styleManager.deleteRule(this.styleRule);
    }
  }

  private selectionDecorations: string[] = [];
}
