import type { Doc } from "yjs";
import type * as Monaco from "monaco-editor";
import randomColor from "randomcolor";
import { StyleManager } from "./StyleManager";
import { CursorDecorations } from "./CursorDecorations";
import { SelectionDecorations } from "./SelectionDecorations";

export class Decoration {
  public cursorDecorations: CursorDecorations;
  public selectionDecorations: SelectionDecorations;

  public styleManager = new StyleManager();

  public cursorColor: string;
  public selectionColor: string;

  public constructor(
    public doc: Doc,
    public monaco: typeof Monaco,
    public monacoEditor: Monaco.editor.IStandaloneCodeEditor,
    public monacoModel: Monaco.editor.ITextModel,
    public userID: string,
    public userName: string
  ) {
    this.cursorColor = randomColor({ luminosity: "dark" });
    this.selectionColor = randomColor({ hue: this.cursorColor, luminosity: "light" });

    this.selectionDecorations = new SelectionDecorations(
      this.doc,
      this.monaco,
      this.monacoEditor,
      this.monacoModel,
      this.userID,
      this.selectionColor,
      this.styleManager
    );

    this.cursorDecorations = new CursorDecorations(
      this.doc,
      this.monaco,
      this.monacoEditor,
      this.monacoModel,
      this.userID,
      this.userName,
      this.cursorColor,
      this.styleManager
    );
  }

  public setCursor(rawCursorStrList?: string[]): void {
    this.cursorDecorations.setCursors(rawCursorStrList);
  }

  public setSelection(rawSelectionsStr?: string): void {
    this.selectionDecorations.setSelections(rawSelectionsStr);
  }

  public rerender(authorId: string = this.userID): Monaco.editor.IModelDeltaDecoration[] {
    return [
      ...this.cursorDecorations.renderCursors(authorId),
      ...this.selectionDecorations.renderSelections(),
    ];
  }

  public destroy(): void {
    this.cursorDecorations.destroy();
    this.selectionDecorations.destroy();
    this.styleManager.destroy();
  }
}
