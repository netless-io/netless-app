import type { Doc } from "yjs";
import type { editor } from "monaco-editor";
import randomColor from "randomcolor";
import { StyleManager } from "./StyleManager";
import { CursorDecoration } from "./CursorDecoration";
import { SelectionDecoration } from "./SelectionDecoration";

export class Decoration {
  public cursorDecorations: CursorDecoration[] = [];
  public selectionDecorations: SelectionDecoration[] = [];

  public styleManager = new StyleManager();

  public cursorColor: string;
  public selectionColor: string;

  public constructor(
    public doc: Doc,
    public monacoEditor: editor.IStandaloneCodeEditor,
    public monacoModel: editor.ITextModel,
    public userID: string,
    public userName: string,
    public cursors?: string[],
    public selections?: string[]
  ) {
    this.cursorColor = randomColor({ luminosity: "dark" });
    this.selectionColor = randomColor({ hue: this.cursorColor, luminosity: "light" });
  }

  public setCursor(cursors?: string[]): void {
    this.cursors = cursors;
    this.renderCursors();
  }

  public setSelection(selections?: string[]): void {
    this.selections = selections;
    this.renderSelections();
  }

  public renderCursors(): void {
    const cursors = this.cursors || [];

    let i = 0;
    for (; i < cursors.length; i++) {
      if (!this.cursorDecorations[i]) {
        this.cursorDecorations[i] = new CursorDecoration(
          this.doc,
          this.monacoEditor,
          this.monacoModel,
          this.userID,
          this.userName,
          this.genDecorationID(),
          this.cursorColor,
          this.styleManager
        );
      }
      this.cursorDecorations[i].setCursor(cursors[i]);
    }

    if (i < this.cursorDecorations.length) {
      for (let j = i; j < this.cursorDecorations.length; j++) {
        if (this.cursorDecorations[j]) {
          this.cursorDecorations[j].destroy();
        }
      }
      this.cursorDecorations.length = i;
    }
  }

  public renderSelections(): void {
    const selections = this.selections || [];

    let i = 0;
    for (; i < selections.length; i++) {
      if (!this.selectionDecorations[i]) {
        this.selectionDecorations[i] = new SelectionDecoration(
          this.doc,
          this.monacoEditor,
          this.monacoModel,
          this.genDecorationID(),
          this.selectionColor,
          this.styleManager
        );
      }
      this.selectionDecorations[i].setSelection(selections[i]);
    }

    if (i < this.selectionDecorations.length) {
      for (let j = i; j < this.selectionDecorations.length; j++) {
        if (this.selectionDecorations[j]) {
          this.selectionDecorations[j].destroy();
        }
      }
      this.selectionDecorations.length = i;
    }
  }

  public destroy(): void {
    this.styleManager.destroy();
  }

  public genDecorationID(): number {
    return this._decorationID++;
  }

  private _decorationID = 0;
}
