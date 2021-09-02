import type { Text, Doc } from "yjs";
import type { AppContext } from "@netless/window-manager";
import type { Event as WhiteEvent } from "white-web-sdk";
import type { NetlessAppMonacoAttributes } from "./typings";
import type { Debounce } from "@netless/app-shared/create-debounce";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import { Awareness } from "y-protocols/awareness";
import { SideEffectManager } from "@netless/app-shared/SideEffectManager";
import { createDebounce } from "@netless/app-shared/create-debounce";
import { fromUint8Array, toUint8Array } from "js-base64";

export class NetlessAppAttributesProvider {
  public awareness: Awareness;

  public yText: Text;

  public constructor(public context: AppContext<NetlessAppMonacoAttributes>, public doc: Doc) {
    this.awareness = new Awareness(this.doc);

    this.sideEffect = new SideEffectManager();

    this.debounce = createDebounce(this.sideEffect);

    this.yText = this.doc.getText("monaco");

    this.attrs = context.getAttributes();

    if (this.attrs?.text) {
      applyUpdate(this.doc, toUint8Array(this.attrs.text));
    }

    this.sideEffect.add(() => {
      const updateAttrs = (attrs?: NetlessAppMonacoAttributes): void => {
        this.attrs = attrs;
      };
      context.emitter.on("attributesUpdate", updateAttrs);
      return () => context.emitter.off("attributesUpdate", updateAttrs);
    });

    this.setupYDoc();
    this.setupAwareness();
    this.setupYDocPersistence();
  }

  public destroy(): void {
    this.sideEffect.flush();
  }

  private setupYDoc(): void {
    this.sideEffect.add(() => {
      const displayer = this.context.getDisplayer();
      const handleUpdate = (event: WhiteEvent) => {
        if (!this.isDocDestroyed && event.authorId !== displayer.observerId) {
          applyUpdate(this.doc, toUint8Array(event.payload), this);
        }
      };
      displayer.addMagixEventListener("AppMonacoDoc", handleUpdate);
      return () => displayer.removeMagixEventListener("AppMonacoDoc", handleUpdate);
    });

    this.sideEffect.add(() => {
      const handleUpdate = (update: Uint8Array, origin: NetlessAppAttributesProvider) => {
        if (origin !== this && this.context.getIsWritable()) {
          const room = this.context.getRoom();
          if (room) {
            room.dispatchMagixEvent("AppMonacoDoc", fromUint8Array(update));
          }
        }
      };
      this.doc.on("update", handleUpdate);
      return () => this.doc.off("update", handleUpdate);
    });
  }

  private setupYDocPersistence(): void {
    const setAttrs = this.debounce(
      (): void => {
        const text = fromUint8Array(encodeStateAsUpdate(this.doc));
        if (text !== this.attrs?.text) {
          if (!this.attrs) {
            this.context.setAttributes({ text });
          } else {
            this.context.updateAttributes(["text"], text);
          }
        }
      },
      { wait: 1000 }
    );

    this.sideEffect.add(() => {
      const onDocDestroyed = (): void => {
        this.isDocDestroyed = true;
      };
      this.doc.on("destroy", onDocDestroyed);
      return () => this.doc.off("destroy", onDocDestroyed);
    });

    this.sideEffect.add(() => {
      const onDocUpdated = (_update: Uint8Array, origin: NetlessAppAttributesProvider): void => {
        // Only the one who updates the docs writes to the shared App Attributes
        if (!this.isDocDestroyed && origin === this) {
          setAttrs();
        }
      };
      this.doc.on("update", onDocUpdated);
      return () => this.doc.off("update", onDocUpdated);
    });
  }

  private setupAwareness(): void {
    // const displayer = this.context.getDisplayer()
    // this.awareness.setLocalStateField('user', {
    //   name: displayer.state.roomMembers.find(member=> member.memberId === displayer.observerId)?.payload?.cursorName || '',
    //   color: `rgb(${displayer.memberState(displayer.observerId).strokeColor.join(',')})`
    // })
    // this.sideEffect.add(() => {
    //   this.awareness.on('')
    //   return () => {
    //     this.awareness.
    //   }
    // })
    // this.context.getRoom()?.dispatchMagixEvent('Nxxxx', {})
  }

  private sideEffect: SideEffectManager;
  private debounce: Debounce;
  private attrs?: NetlessAppMonacoAttributes;
  private isDocDestroyed = false;
}
