import type { Doc } from "yjs";
import type { editor } from "monaco-editor";
import { Range } from "monaco-editor";
import { createAbsolutePositionFromRelativePosition, createRelativePositionFromJSON } from "yjs";
import type { StyleManager } from "./StyleManager";

export class CursorDecoration {
  public readonly cursorClassName: string;

  public rawCursorSrc?: string;
  public cursor: unknown;

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

  public renderCursor(
    rawCursorSrc: string,
    authorId: string
  ): editor.IModelDeltaDecoration | undefined {
    const cursorChanged = rawCursorSrc !== this.rawCursorSrc;

    if (cursorChanged) {
      this.rawCursorSrc = rawCursorSrc;
      this.cursor = void 0;
      if (rawCursorSrc) {
        try {
          this.cursor = JSON.parse(rawCursorSrc);
        } catch (e) {
          console.warn(e);
        }
      }
    }

    if (this.cursor) {
      try {
        const cursorAbs = createAbsolutePositionFromRelativePosition(
          createRelativePositionFromJSON(this.cursor),
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

          if (
            cursorChanged ||
            (authorId === this.userID &&
              (pos.lineNumber !== this.lastLineNumber || pos.column !== this.lastColumn))
          ) {
            this.setCursorVisible(true);
            this.setLabelVisible(true);
            this.lastLineNumber = pos.lineNumber;
            this.lastColumn = pos.column;
          }

          return {
            range: new Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column + 1),
            options: {
              className,
              hoverMessage: { value: this.userName },
            },
          };
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
      if (!this.labelStyleRule) {
        this.labelStyleRule = this.styleManager.addRule(
          `.${this.cursorClassName} { --content: "${this.userName}"; --bg-color: ${this.cursorColor}; }`
        );
      }
      if (this.labelStyleRule) {
        if (!this.labelVisible) {
          this.labelStyleRule.style.setProperty("--label", "block");
          this.labelVisible = true;
        }
        this.hideLabelTimeout = setTimeout(() => this.setLabelVisible(false), 3000);
      }
    } else {
      if (this.labelStyleRule && this.labelVisible) {
        this.labelStyleRule.style.setProperty("--label", "none");
        this.labelVisible = false;
      }
    }
  }

  public setCursorVisible(visible: boolean): void {
    window.clearTimeout(this.hideCursorTimeout);
    if (visible) {
      if (!this.cursorStyleRule) {
        this.cursorStyleRule = this.styleManager.addRule(`.${this.cursorClassName} {}`);
      }
      if (this.cursorStyleRule) {
        if (!this.cursorVisible) {
          this.cursorStyleRule.style.setProperty("display", "block");
          this.cursorVisible = true;
        }
        this.hideCursorTimeout = setTimeout(() => this.setCursorVisible(false), 8000);
      }
    } else {
      if (this.cursorStyleRule && this.cursorVisible) {
        this.cursorStyleRule.style.setProperty("display", "none");
        this.cursorVisible = false;
      }
    }
  }

  public clearCursor(): void {
    window.clearTimeout(this.hideCursorTimeout);
    window.clearTimeout(this.hideLabelTimeout);
  }

  public destroy(): void {
    this.clearCursor();
    if (this.labelStyleRule) {
      this.styleManager.deleteRule(this.labelStyleRule);
    }
    if (this.cursorStyleRule) {
      this.styleManager.deleteRule(this.cursorStyleRule);
    }
  }

  public labelVisible = false;
  private hideLabelTimeout = NaN;
  private labelStyleRule: CSSStyleRule | null | undefined;

  private cursorVisible = false;
  private hideCursorTimeout = NaN;
  private cursorStyleRule: CSSStyleRule | null | undefined;

  private lastLineNumber = -1;
  private lastColumn = -1;
}
