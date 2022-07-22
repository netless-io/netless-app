import type IQuillRange from "quill-cursors/dist/quill-cursors/i-range";

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
  const ME = context.room?.uid || "";

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
          if (context.isWritable && context.storage.state.text !== text) {
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
      if (ev.authorId !== context.displayer.observerId) {
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

  const cursors$$ = context.createStorage<{ [uid: string]: UserCursor | null }>("cursors", {});
  const timers = new Map<string, number>();

  const refreshCursors = () => {
    Object.keys(cursors$$.state).forEach(uid => {
      if (uid === ME) {
        return update_cursor(cursors, null, uid, doc, type, timers);
      }
      const cursor = cursors$$.state[uid];
      const member = context.members.find(a => a.uid === uid);
      if (!member) {
        // setState() will trigger refreshCursors() synchronously, so we must schedule it to next tick.
        if (context.isWritable) {
          next_tick().then(() => cursors$$.setState({ [uid]: undefined }));
        }
        return update_cursor(cursors, null, uid, doc, type, timers);
      }
      const user: UserInfo = {
        name: member.payload?.nickName,
        color: color_to_string(member.memberState.strokeColor),
      };
      update_cursor(cursors, { user, cursor }, uid, doc, type, timers);
    });
  };
  sideEffect.add(() => {
    const onSelectionChange = (_0: string, _1: unknown, _2: unknown, origin: string) => {
      const sel = editor.getSelection();
      // prevent incorrect cursor jumping https://github.com/yjs/y-quill/issues/14
      if (origin === "silent") return;
      if (sel === null) {
        context.isWritable && cursors$$.setState({ [ME]: null });
      } else {
        const anchor = Y.createRelativePositionFromTypeIndex(type, sel.index);
        const head = Y.createRelativePositionFromTypeIndex(type, sel.index + sel.length);
        context.isWritable && cursors$$.setState({ [ME]: { anchor, head } });
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
  uid: string,
  doc: Y.Doc,
  type: Y.Text,
  timers: Map<string, number>
) {
  try {
    if (aw && aw.cursor) {
      const user = aw.user || {};
      const color = user.color || "#ffa500";
      const name = user.name || `User: ${uid}`;
      const cursor = cursors.createCursor(uid, name, color);
      const anchor = Y.createAbsolutePositionFromRelativePosition(
        Y.createRelativePositionFromJSON(aw.cursor.anchor),
        doc
      );
      const head = Y.createAbsolutePositionFromRelativePosition(
        Y.createRelativePositionFromJSON(aw.cursor.head),
        doc
      );
      if (anchor && head && anchor.type === type) {
        const range: IQuillRange = {
          index: anchor.index,
          length: head.index - anchor.index,
        };
        if (
          !cursor.range ||
          range.index !== cursor.range.index ||
          range.length !== cursor.range.length
        ) {
          cursors.moveCursor(uid, range);
          let timer = timers.get(uid) || 0;
          if (timer) clearTimeout(timer);
          cursor.toggleFlag(true);
          timer = setTimeout(() => cursor.toggleFlag(false), 3000);
          timers.set(uid, timer);
        }
      }
    } else {
      cursors.removeCursor(uid);
    }
  } catch (err) {
    console.error(err);
  }
}
