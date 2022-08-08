import type { AppContext, Member, ReadonlyTeleBox, Storage } from "@netless/window-manager";
import type { Vector } from "@netless/y";
import type * as Monaco from "monaco-editor";
import type { Doc, Text, YTextEvent } from "yjs";
import type { NetlessAppMonacoAttributes } from "./typings";

import { createVector } from "@netless/y";
import { connect as connectYjs } from "@netless/y/yjs";
import { createMutex } from "lib0/mutex.js";
import { SideEffectManager } from "side-effect-manager";
import { createRelativePositionFromTypeIndex } from "yjs";
import { Decoration } from "./Decorations";

export class YMonaco {
  public monacoModel: Monaco.editor.ITextModel;
  public authorId: string;

  public cursors$$: Storage<{ [key: string]: string[] }>;
  public selections$$: Storage<{ [key: string]: string }>;
  public vector: Vector;

  public constructor(
    public context: AppContext<NetlessAppMonacoAttributes>,
    public box: ReadonlyTeleBox,
    public monaco: typeof Monaco,
    public monacoEditor: Monaco.editor.IStandaloneCodeEditor,
    public doc: Doc,
    public yText: Text,
    public readonly: boolean
  ) {
    const monacoModel = monacoEditor.getModel();
    this.authorId = String(this.context.displayer.observerId);

    if (!monacoModel) {
      throw new Error("[NetlessAppMonaco] No Monaco Model");
    }

    this.monacoModel = monacoModel;

    this.sideEffect = new SideEffectManager();

    this.observerId = String(context.displayer.observerId);

    this.cursors$$ = context.createStorage("cursors");
    this.selections$$ = context.createStorage("selections");

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).monaco$$ = this;
    }

    this.vector = createVector(context, "text");

    this.setupDecorations();

    this.setupAttrsUpdate();
    this.setupYText();
    this.setupMembers();
    this.setupDocUpdate();
  }

  // https://github.com/yjs/y-monaco/issues/6
  private ensureLF() {
    this.monacoModel.setEOL(this.monaco.editor.EndOfLineSequence.LF);
  }

  public setReadonly(readonly: boolean): void {
    if (readonly !== this.readonly) {
      this.readonly = readonly;
      if (!readonly) {
        this.broadcastCursors();
        this.broadcastSelections();
      }
    }
  }

  public clearDecorationAttrs(): void {
    this.cursors$$.setState({ [this.observerId]: undefined });
    this.selections$$.setState({ [this.observerId]: undefined });
  }

  public destroy(): void {
    this.sideEffect.flushAll();
    this.decorations.forEach(decoration => decoration.destroy());
    this.decorations.clear();
    this.clearDecorationAttrs();
    this.vector.destroy();
  }

  private setupYText(): void {
    this.sideEffect.add(() => {
      const yTextObserver = (event: YTextEvent) => {
        this.mux(() => {
          if (this.monacoModel.isDisposed()) {
            return;
          }
          this.ensureLF();
          let index = 0;
          event.delta.forEach(op => {
            if (op.retain != null) {
              index += op.retain;
            } else if (op.insert != null) {
              const pos = this.monacoModel.getPositionAt(index);
              const range = new this.monaco.Selection(
                pos.lineNumber,
                pos.column,
                pos.lineNumber,
                pos.column
              );
              this.monacoModel.applyEdits([
                { range, text: String(op.insert), forceMoveMarkers: true },
              ]);
              index += op.insert.length;
            } else if (op.delete != null) {
              const pos = this.monacoModel.getPositionAt(index);
              const endPos = this.monacoModel.getPositionAt(index + op.delete);
              const range = new this.monaco.Selection(
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
          this.ensureLF();
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

  private setupDocUpdate(): void {
    this.sideEffect.addDisposer(connectYjs(this.vector, this.doc));
  }

  private setupDecorations(): void {
    this.sideEffect.add(() => {
      const disposable = this.monacoEditor.onDidChangeCursorPosition(event => {
        this.cursorPositions = [event.position, ...event.secondaryPositions];
        if (!this.readonly) {
          this.broadcastCursors();
        }
      });
      return () => disposable.dispose();
    });

    this.sideEffect.add(() => {
      const disposable = this.monacoEditor.onDidChangeCursorSelection(() => {
        if (!this.readonly) {
          this.broadcastSelections();
        }
      });
      return () => disposable.dispose();
    });
  }

  private broadcastCursors(): void {
    this.ensureLF();
    try {
      const rawCursorStrList = this.cursorPositions.map(position =>
        JSON.stringify(
          createRelativePositionFromTypeIndex(this.yText, this.monacoModel.getOffsetAt(position))
        )
      );
      this.cursors$$.setState({ [this.observerId]: rawCursorStrList });
    } catch (e) {
      console.warn(e);
    }
  }

  private broadcastSelections(): void {
    this.ensureLF();
    const selections = this.monacoEditor.getSelections();
    if (selections) {
      try {
        const rawSelectionsStr = JSON.stringify(
          selections
            .filter(selection => !this.monaco.Selection.isEmpty(selection))
            .map(selection => ({
              start: createRelativePositionFromTypeIndex(
                this.yText,
                this.monacoModel.getOffsetAt(selection.getStartPosition())
              ),
              end: createRelativePositionFromTypeIndex(
                this.yText,
                this.monacoModel.getOffsetAt(selection.getEndPosition())
              ),
            }))
        );
        this.selections$$.setState({ [this.observerId]: rawSelectionsStr });
      } catch (e) {
        console.warn(e);
      }
    }
  }

  private setupAttrsUpdate(): void {
    const handleAttrsUpdate = () => {
      this.context.members.forEach(member => {
        const id = String(member.memberId);
        if (id !== this.observerId) {
          let decoration = this.decorations.get(id);
          if (!decoration) {
            decoration = new Decoration(
              this.doc,
              this.monaco,
              this.monacoEditor,
              this.monacoModel,
              id,
              member.payload?.nickName || id
            );
            this.decorations.set(id, decoration);
          }
          decoration.setCursor(this.cursors$$.state[id]);
          decoration.setSelection(this.selections$$.state[id]);
          this.renderDecorations();
        }
      });
    };
    this.sideEffect.addDisposer(this.cursors$$.addStateChangedListener(handleAttrsUpdate));
    this.sideEffect.addDisposer(this.selections$$.addStateChangedListener(handleAttrsUpdate));
  }

  private setupMembers(): void {
    this.sideEffect.add(() => {
      const handleMembersChanged = (members: Member[]) => {
        const memberIds = new Set(members.map(member => String(member.memberId)));
        this.decorations.forEach((decoration, memberId) => {
          if (!memberIds.has(memberId)) {
            decoration.destroy();
            this.decorations.delete(memberId);
          }
        });
        Object.keys(this.cursors$$.state).forEach(memberId => {
          if (!memberIds.has(memberId)) {
            this.cursors$$.setState({ [memberId]: undefined });
          }
        });

        Object.keys(this.selections$$.state).forEach(memberId => {
          if (!memberIds.has(memberId)) {
            this.selections$$.setState({ [memberId]: undefined });
          }
        });
      };
      return this.context.emitter.on("roomMembersChange", handleMembersChanged);
    });
  }

  private renderDecorations(): void {
    const deltaDecorations: Monaco.editor.IModelDeltaDecoration[] = [];
    this.decorations.forEach(decoration => {
      deltaDecorations.push(...decoration.rerender(this.authorId));
    });
    this.deltaDecorations = this.monacoModel.deltaDecorations(
      this.deltaDecorations,
      deltaDecorations
    );
  }

  private sideEffect: SideEffectManager;

  private observerId: string;

  private decorations = new Map<string, Decoration>();

  private mux = createMutex();

  private deltaDecorations: string[] = [];

  private cursorPositions: Monaco.Position[] = [];
}
