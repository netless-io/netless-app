import type * as Monaco from "monaco-editor";
import type { Doc } from "yjs";
import type { StyleManager } from "./StyleManager";

import { createAbsolutePositionFromRelativePosition, createRelativePositionFromJSON } from "yjs";

export class CursorDecoration {
  public readonly cursorClassName: string;

  public rawCursorSrc?: string;
  public cursor: unknown;

  public constructor(
    public doc: Doc,
    public monaco: typeof Monaco,
    public monacoEditor: Monaco.editor.IStandaloneCodeEditor,
    public monacoModel: Monaco.editor.ITextModel,
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
  ): Monaco.editor.IModelDeltaDecoration | undefined {
    if (this.monacoModel.isDisposed()) {
      return;
    }

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
            range: new this.monaco.Range(
              pos.lineNumber,
              pos.column,
              pos.lineNumber,
              pos.column + 1
            ),
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
      if (this.styleRule) {
        if (!this.labelVisible) {
          this.styleRule.style.setProperty("--label", "block");
          this.styleRule.style.setProperty("--dot", "none");
          this.labelVisible = true;
        }
        this.hideLabelTimeout = window.setTimeout(() => this.setLabelVisible(false), 3000);
      }
    } else {
      if (this.styleRule && this.labelVisible) {
        this.styleRule.style.setProperty("--label", "none");
        this.styleRule.style.setProperty("--dot", "block");
        this.labelVisible = false;
      }
    }
  }

  public setCursorVisible(visible: boolean): void {
    window.clearTimeout(this.hideCursorTimeout);
    if (visible) {
      if (this.styleRule) {
        if (!this.cursorVisible) {
          this.styleRule.style.setProperty("display", "block");
          this.cursorVisible = true;
        }
        this.hideCursorTimeout = window.setTimeout(() => this.setCursorVisible(false), 8000);
      }
    } else {
      if (this.styleRule && this.cursorVisible) {
        this.styleRule.style.setProperty("display", "none");
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
    if (this._styleRuleMemo) {
      this.styleManager.deleteRule(this._styleRuleMemo);
    }
  }

  private _styleRuleMemo: CSSStyleRule | null | undefined;
  private get styleRule(): CSSStyleRule | null | undefined {
    if (!this._styleRuleMemo) {
      this._styleRuleMemo = this.styleManager.addRule(
        `.${this.cursorClassName} { --content: "${this.userName}"; --bg-color: ${this.cursorColor}; }`
      );
    }
    return this._styleRuleMemo;
  }

  public labelVisible = false;
  private hideLabelTimeout = NaN;

  private cursorVisible = false;
  private hideCursorTimeout = NaN;

  private lastLineNumber = -1;
  private lastColumn = -1;
}
