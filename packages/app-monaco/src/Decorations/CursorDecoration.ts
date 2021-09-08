import type { Doc } from "yjs";
import { createAbsolutePositionFromRelativePosition, createRelativePositionFromJSON } from "yjs";
import type { editor } from "monaco-editor";
import { Range } from "monaco-editor";
import type { StyleManager } from "./StyleManager";

export class CursorDecoration {
  public rawCursorStr?: string;

  public styleRule: CSSStyleRule | null | undefined;

  public readonly cursorClassName: string;

  public constructor(
    public doc: Doc,
    public monacoEditor: editor.IStandaloneCodeEditor,
    public monacoModel: editor.ITextModel,
    public userID: string,
    public userName: string,
    /** ID for a cursor */
    public decorationID: number,
    public cursorColor: string,
    public styleManager: StyleManager
  ) {
    this.cursorClassName = `netless-app-monaco-cursor-${this.decorationID}`;
  }

  public setCursor(rawCursorStr?: string): void {
    if (rawCursorStr === this.rawCursorStr) {
      return;
    }

    this.rawCursorStr = rawCursorStr;

    if (rawCursorStr) {
      try {
        const cursorAbs = createAbsolutePositionFromRelativePosition(
          createRelativePositionFromJSON(JSON.parse(rawCursorStr)),
          this.doc
        );
        if (cursorAbs) {
          const pos = this.monacoModel.getPositionAt(cursorAbs.index);
          let className = `netless-app-monaco-cursor ${this.cursorClassName}`;

          if (pos.lineNumber <= 1) {
            className += " netless-app-monaco-cursor-first-line";
          }

          if (
            this.monacoEditor.getLayoutInfo().width -
              this.monacoEditor.getOffsetForColumn(pos.lineNumber, pos.column) <
            200
          ) {
            className += " netless-app-monaco-cursor-right";
          }

          const cursorDecoration = [
            {
              range: new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column + 1),
              options: {
                className,
                hoverMessage: { value: this.userName },
              },
            },
          ];
          this.cursorDecoration = this.monacoEditor.deltaDecorations(
            this.cursorDecoration,
            cursorDecoration
          );
          this.setLabelVisible(true);
          return;
        }
      } catch (e) {
        console.warn(e);
      }
    }

    this.clearCursor();
  }

  public setLabelVisible(visible: boolean): void {
    window.clearTimeout(this.hideLabelTimeout);
    if (visible) {
      if (!this.styleRule) {
        this.styleRule = this.styleManager.addRule(
          `.${this.cursorClassName} { --content: "${this.userName}"; --bg-color: ${this.cursorColor}; }`
        );
      }
      if (this.styleRule) {
        this.styleRule.style.setProperty("--label", "block");
        this.hideLabelTimeout = setTimeout(() => this.setLabelVisible(false), 3000);
      }
    } else {
      if (this.styleRule) {
        this.styleRule.style.setProperty("--label", "none");
      }
    }
  }

  public clearCursor(): void {
    window.clearTimeout(this.hideLabelTimeout);
    this.cursorDecoration = this.monacoEditor.deltaDecorations(this.cursorDecoration, []);
  }

  public destroy(): void {
    this.clearCursor();
    if (this.styleRule) {
      this.styleManager.deleteRule(this.styleRule);
    }
  }

  private cursorDecoration: string[] = [];

  private hideLabelTimeout = NaN;
}
