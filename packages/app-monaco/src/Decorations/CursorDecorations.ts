import type * as Monaco from "monaco-editor";
import type { Doc } from "yjs";
import type { StyleManager } from "./StyleManager";

import { CursorDecoration } from "./CursorDecoration";

export class CursorDecorations {
  public rawCursorStrList?: string[];
  public cursorDecorations: CursorDecoration[] = [];

  public constructor(
    public doc: Doc,
    public monaco: typeof Monaco,
    public monacoEditor: Monaco.editor.IStandaloneCodeEditor,
    public monacoModel: Monaco.editor.ITextModel,
    public userID: string,
    public userName: string,
    public cursorColor: string,
    public styleManager: StyleManager
  ) {}

  public setCursors(rawCursorStrList?: string[]): void {
    this.rawCursorStrList = rawCursorStrList;
  }

  public renderCursors(authorId: string): Monaco.editor.IModelDeltaDecoration[] {
    const cursors = this.rawCursorStrList || [];
    const cursorDeltaDecorations: Monaco.editor.IModelDeltaDecoration[] = [];

    let i = 0;
    for (; i < cursors.length; i++) {
      if (!this.cursorDecorations[i]) {
        this.cursorDecorations[i] = new CursorDecoration(
          this.doc,
          this.monaco,
          this.monacoEditor,
          this.monacoModel,
          this.userID,
          this.userName,
          this.genDecorationID(),
          this.cursorColor,
          this.styleManager
        );
      }
      const cursorDeltaDecoration = this.cursorDecorations[i].renderCursor(cursors[i], authorId);
      if (cursorDeltaDecoration) {
        cursorDeltaDecorations.push(cursorDeltaDecoration);
      }
    }

    if (i < this.cursorDecorations.length) {
      for (let j = i; j < this.cursorDecorations.length; j++) {
        if (this.cursorDecorations[j]) {
          this.cursorDecorations[j].clearCursor();
        }
      }
      this.cursorDecorations.length = i;
    }

    return cursorDeltaDecorations;
  }

  public destroy(): void {
    this.cursorDecorations.forEach(cursorDecoration => {
      cursorDecoration.destroy();
    });
    this.cursorDecorations.length = 0;
  }

  public genDecorationID(): number {
    return CursorDecorations._decorationID++;
  }

  private static _decorationID = 0;
}
