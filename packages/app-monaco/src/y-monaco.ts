import type { Text, Doc, YTextEvent } from "yjs";
import { createRelativePositionFromTypeIndex } from "yjs";
import { Selection } from "monaco-editor";
import type { editor } from "monaco-editor";
import { createMutex } from "lib0/mutex.js";
import type { AppContext, ReadonlyTeleBox } from "@netless/window-manager";
import type { DisplayerState } from "white-web-sdk";
import { SideEffectManager } from "../../app-shared/dist/SideEffectManager";
import type { NetlessAppMonacoAttributes } from "./typings";
import { Decoration } from "./Decorations";

export class YMonaco {
  public _decorations: string[] = [];

  public monacoModel: editor.ITextModel;

  public constructor(
    public context: AppContext<NetlessAppMonacoAttributes>,
    public attrs: NetlessAppMonacoAttributes,
    public box: ReadonlyTeleBox,
    public monacoEditor: editor.IStandaloneCodeEditor,
    public doc: Doc,
    public yText: Text
  ) {
    const monacoModel = monacoEditor.getModel();

    if (!monacoModel) {
      throw new Error("[NetlessAppMonaco] No Monaco Model");
    }

    this.monacoModel = monacoModel;

    this.sideEffect = new SideEffectManager();

    this.observerId = String(context.getDisplayer().observerId);

    this.broadcastCursors();
    this.broadcastSelections();

    this.setupAttrsUpdate();

    this.setupYText();

    this.setupMembers();
  }

  public destroy(): void {
    this.sideEffect.flush();
  }

  private setupYText(): void {
    this.sideEffect.add(() => {
      const yTextObserver = (event: YTextEvent) => {
        this.mux(() => {
          let index = 0;
          event.delta.forEach(op => {
            if (op.retain != null) {
              index += op.retain;
            } else if (op.insert != null) {
              const pos = this.monacoModel.getPositionAt(index);
              const range = new Selection(pos.lineNumber, pos.column, pos.lineNumber, pos.column);
              this.monacoModel.applyEdits([{ range, text: String(op.insert) }]);
              index += op.insert.length;
            } else if (op.delete != null) {
              const pos = this.monacoModel.getPositionAt(index);
              const endPos = this.monacoModel.getPositionAt(index + op.delete);
              const range = new Selection(
                pos.lineNumber,
                pos.column,
                endPos.lineNumber,
                endPos.column
              );
              this.monacoModel.applyEdits([{ range, text: "" }]);
            } else {
              console.error("Unexpected yText Observer");
            }
          });
        });
      };
      this.yText.observe(yTextObserver);
      return () => this.yText.unobserve(yTextObserver);
    });

    this.monacoModel.setValue(this.yText.toString());

    this.sideEffect.add(() => {
      const disposer = this.monacoModel.onDidChangeContent(event => {
        // apply changes from right to left
        this.mux(() => {
          this.doc.transact(() => {
            event.changes
              .sort((change1, change2) => change2.rangeOffset - change1.rangeOffset)
              .forEach(change => {
                this.yText.delete(change.rangeOffset, change.rangeLength);
                this.yText.insert(change.rangeOffset, change.text);
              });
          }, this);
        });
      });
      return () => disposer.dispose();
    });
  }

  private broadcastCursors(): void {
    this.sideEffect.add(() => {
      const disposable = this.monacoEditor.onDidChangeCursorPosition(event => {
        this.curCursors = [event.position, ...event.secondaryPositions].map(position =>
          JSON.stringify(
            createRelativePositionFromTypeIndex(this.yText, this.monacoModel.getOffsetAt(position))
          )
        );
        this.context.updateAttributes(["cursors", this.observerId], this.curCursors);
      });
      return () => disposable.dispose();
    });
  }

  private broadcastSelections(): void {
    this.sideEffect.add(() => {
      const disposable = this.monacoEditor.onDidChangeCursorSelection(() => {
        const selections = this.monacoEditor.getSelections();
        if (selections) {
          this.curSelections = selections.map(selection =>
            JSON.stringify({
              start: createRelativePositionFromTypeIndex(
                this.yText,
                this.monacoModel.getOffsetAt(selection.getStartPosition())
              ),
              end: createRelativePositionFromTypeIndex(
                this.yText,
                this.monacoModel.getOffsetAt(selection.getEndPosition())
              ),
            })
          );
          this.context.updateAttributes(["selections", this.observerId], this.curSelections);
        }
      });
      return () => disposable.dispose();
    });
  }

  private setupAttrsUpdate(): void {
    this.sideEffect.add(() => {
      const handleAttrsUpdate = () => {
        this.context.getDisplayer().state.roomMembers.forEach(member => {
          const id = String(member.memberId);
          if (id !== this.observerId) {
            const decoration = this.decorations.get(id);
            if (!decoration) {
              this.decorations.set(
                id,
                new Decoration(
                  this.doc,
                  this.monacoEditor,
                  this.monacoModel,
                  id,
                  member.payload?.cursorName || id,
                  this.attrs.cursors?.[id],
                  this.attrs.selections?.[id]
                )
              );
            } else {
              decoration.setCursor(this.attrs.cursors?.[id]);
              decoration.setSelection(this.attrs.selections?.[id]);
            }
          }
        });
      };
      this.context.emitter.on("attributesUpdate", handleAttrsUpdate);
      return () => this.context.emitter.off("attributesUpdate", handleAttrsUpdate);
    });
  }

  private setupMembers(): void {
    this.sideEffect.add(() => {
      const handleStateChanged = (state: Partial<DisplayerState>) => {
        if (state.roomMembers) {
          const members = new Set(state.roomMembers.map(member => String(member.memberId)));
          this.decorations.forEach((decoration, memberId) => {
            if (!members.has(memberId)) {
              decoration.destroy();
              this.decorations.delete(memberId);
            }
          });
        }
      };
      this.context.emitter.on("roomStateChange", handleStateChanged);
      return () => this.context.emitter.off("roomStateChange", handleStateChanged);
    });
  }

  private sideEffect: SideEffectManager;

  private observerId: string;

  private curCursors: string[] = [];

  private curSelections: string[] = [];

  private decorations = new Map<string, Decoration>();

  private mux = createMutex();
}
