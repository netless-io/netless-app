import type { Text, Doc } from "yjs";
import type { AppContext } from "@netless/window-manager";
import type { NetlessAppMonacoAttributes } from "./typings";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import { SideEffectManager } from "side-effect-manager";
import { fromUint8Array, toUint8Array } from "js-base64";

export class NetlessAppMonacoPersistence {
  public constructor(
    public context: AppContext<NetlessAppMonacoAttributes>,
    public attrs: NetlessAppMonacoAttributes,
    public doc: Doc,
    public yText: Text
  ) {
    this.sideEffect = new SideEffectManager();

    this.textAttr = attrs.text;

    if (this.textAttr) {
      applyUpdate(this.doc, toUint8Array(this.textAttr), this);
    }

    this.sideEffect.add(() =>
      context.mobxUtils.autorun(() => {
        this.textAttr = attrs.text;
      })
    );

    this.setupYDocPersistence();
  }

  public destroy(): void {
    this.sideEffect.flushAll();
  }

  private setupYDocPersistence(): void {
    const setAttrs = (): void => {
      this.sideEffect.setTimeout(
        () => {
          const text = fromUint8Array(encodeStateAsUpdate(this.doc));
          if (text !== this.textAttr) {
            // @TODO handle large text
            this.context.updateAttributes(["text"], text);
          }
        },
        1000,
        "setAttrs"
      );
    };

    this.sideEffect.add(() => {
      const onDocDestroyed = (): void => {
        this.isDocDestroyed = true;
      };
      this.doc.on("destroy", onDocDestroyed);
      return () => this.doc.off("destroy", onDocDestroyed);
    });

    this.sideEffect.add(() => {
      const onDocUpdated = (_update: Uint8Array, origin: string): void => {
        // Only the one who updates the yDoc (origin is yMonaco) writes to the shared App Attributes
        if (!this.isDocDestroyed && origin !== "_remote_edit_") {
          setAttrs();
        }
      };
      this.doc.on("update", onDocUpdated);
      return () => this.doc.off("update", onDocUpdated);
    });
  }

  private sideEffect: SideEffectManager;

  private isDocDestroyed = false;
  private textAttr?: string;
}
