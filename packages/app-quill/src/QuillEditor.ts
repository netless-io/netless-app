import type { AppContext } from "@netless/window-manager";
import type { NetlessAppQuillAttributes, NetlessAppQuillEvents } from "./index";

import * as Y from "yjs";

import Quill from "quill";
import QuillCursors from "quill-cursors";
import { QuillBinding } from "y-quill";
import { SideEffectManager } from "side-effect-manager";
import { fromUint8Array, toUint8Array } from "js-base64";

import { add_class, color_to_string, element, next_tick } from "./internal";
import styles from "./style.scss?inline";

Quill.register("modules/cursors", QuillCursors);

export class QuillEditor {
  static readonly styles = styles;

  readonly editor: Quill;
  readonly cursors: QuillCursors;

  readonly yDoc: Y.Doc;
  readonly yText: Y.Text;
  readonly yBinding: QuillBinding;

  readonly $container: HTMLDivElement;
  readonly $editor: HTMLDivElement;

  readonly sideEffect = new SideEffectManager();

  constructor(readonly context: AppContext<NetlessAppQuillAttributes, NetlessAppQuillEvents>) {
    this.yDoc = new Y.Doc();
    this.yText = this.yDoc.getText("quill");

    this.$container = add_class(element("div"), "container");
    this.$editor = add_class(element("div"), "editor");
    this.$container.appendChild(this.$editor);

    context.box.mountStyles(QuillEditor.styles);
    context.box.mountContent(this.$container);

    this.editor = new Quill(this.$editor, {
      modules: {
        cursors: true,
        toolbar: [
          [{ header: [1, 2, false] }],
          [{ list: "ordered" }, { list: "bullet" }],
          ["bold", "italic", "underline"],
          ["code-block"],
          [{ color: [] }, { background: [] }],
        ],
        history: {
          userOnly: true,
        },
      },
      placeholder: "Hello, world!",
      theme: "snow",
      readOnly: !context.isWritable,
    });

    this.cursors = this.editor.getModule("cursors");

    this.yBinding = new QuillBinding(this.yText, this.editor);

    setup_sync_handlers(this);
  }

  destroy() {
    this.yBinding.destroy();
    if (this.$container.parentElement) {
      this.$container.remove();
    }
  }
}

type UserCursor = { anchor: Y.RelativePosition; head: Y.RelativePosition };
type UserInfo = { name?: string; color?: string };

function setup_sync_handlers({
  sideEffect,
  context,
  editor,
  cursors,
  yDoc: doc,
  yText: type,
}: QuillEditor) {
  const ME = context.currentMember.memberId;

  sideEffect.addDisposer(
    context.emitter.on("writableChange", () => {
      context.isWritable ? editor.enable() : editor.disable();
    })
  );

  // #region Persist

  if (context.storage.state.text) {
    Y.applyUpdate(doc, toUint8Array(context.storage.state.text), "_persist_");
  }
  sideEffect.add(() => {
    const persistText = () => {
      sideEffect.setTimeout(
        () => {
          const text = fromUint8Array(Y.encodeStateAsUpdate(doc));
          if (context.storage.state.text !== text) {
            context.storage.setState({ text });
          }
        },
        1000,
        "persistText"
      );
    };
    doc.on("update", persistText);
    return () => doc.off("update", persistText);
  });

  // #endregion

  // #region Deltas

  sideEffect.addDisposer(
    context.addMagixEventListener("edit", ev => {
      if (ev.authorId !== ME) {
        try {
          Y.applyUpdate(doc, toUint8Array(ev.payload), "_remote_edit_");
        } catch (e) {
          console.warn(e);
        }
      }
    })
  );

  sideEffect.add(() => {
    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin !== "_remote_edit_" && context.isWritable) {
        context.dispatchMagixEvent("edit", fromUint8Array(update));
      }
    };
    doc.on("update", handleUpdate);
    return () => doc.off("update", handleUpdate);
  });

  // #endregion

  // #region Cursors

  const cursors$$ = context.createStorage<{ [id: number]: UserCursor | null }>("cursors", {});

  const refreshCursors = () => {
    Object.keys(cursors$$.state).forEach(memberIdStr => {
      const memberId = parseInt(memberIdStr);
      if (memberId === ME) {
        return update_cursor(cursors, null, memberId, doc, type);
      }
      const cursor = cursors$$.state[memberId];
      const member = context.members.find(a => a.memberId === memberId);
      if (!member) {
        next_tick().then(() => cursors$$.setState({ [memberId]: undefined }));
        return update_cursor(cursors, null, memberId, doc, type);
      }
      const user: UserInfo = member && {
        name: member.payload?.nickName,
        color: color_to_string(member.memberState.strokeColor),
      };
      update_cursor(cursors, { user, cursor }, memberId, doc, type);
    });
  };
  sideEffect.add(() => {
    const onSelectionChange = (_0: string, _1: unknown, _2: unknown, origin: string) => {
      const sel = editor.getSelection();
      // prevent incorrect cursor jumping https://github.com/yjs/y-quill/issues/14
      if (origin === "silent") return;
      if (sel === null) {
        cursors$$.setState({ [ME]: null });
      } else {
        const anchor = Y.createRelativePositionFromTypeIndex(type, sel.index);
        const head = Y.createRelativePositionFromTypeIndex(type, sel.index + sel.length);
        cursors$$.setState({ [ME]: { anchor, head } });
      }
      refreshCursors();
    };
    editor.on("editor-change", onSelectionChange);
    return () => editor.off("editor-change", onSelectionChange);
  });
  sideEffect.addDisposer(cursors$$.addStateChangedListener(refreshCursors));
  sideEffect.addDisposer(context.emitter.on("roomMembersChange", refreshCursors));

  // #endregion
}

interface CursorAware {
  cursor?: UserCursor | null;
  user?: UserInfo | null;
}

function update_cursor(
  cursors: QuillCursors,
  aw: CursorAware | null,
  clientId: number,
  doc: Y.Doc,
  type: Y.Text
) {
  try {
    if (aw && aw.cursor && clientId !== doc.clientID) {
      const user = aw.user || {};
      const color = user.color || "#ffa500";
      const name = user.name || `User: ${clientId}`;
      cursors.createCursor(clientId.toString(), name, color);
      const anchor = Y.createAbsolutePositionFromRelativePosition(
        Y.createRelativePositionFromJSON(aw.cursor.anchor),
        doc
      );
      const head = Y.createAbsolutePositionFromRelativePosition(
        Y.createRelativePositionFromJSON(aw.cursor.head),
        doc
      );
      if (anchor && head && anchor.type === type) {
        cursors.moveCursor(String(clientId), {
          index: anchor.index,
          length: head.index - anchor.index,
        });
        cursors.toggleFlag(String(clientId), true);
      }
    } else {
      cursors.removeCursor(String(clientId));
    }
  } catch (err) {
    console.error(err);
  }
}
