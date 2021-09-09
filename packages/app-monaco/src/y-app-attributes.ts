import type { Text, Doc } from "yjs";
import type { AppContext } from "@netless/window-manager";
import type { Event as WhiteEvent } from "white-web-sdk";
import type { NetlessAppMonacoAttributes } from "./typings";
import type { Debounce } from "@netless/app-shared/create-debounce";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import { SideEffectManager } from "@netless/app-shared/SideEffectManager";
import { createDebounce } from "@netless/app-shared/create-debounce";
import { fromUint8Array, toUint8Array } from "js-base64";

export class NetlessAppAttributesProvider {
  public yText: Text;

  public constructor(
    public context: AppContext<NetlessAppMonacoAttributes>,
    public attrs: NetlessAppMonacoAttributes,
    public doc: Doc
  ) {
    this.sideEffect = new SideEffectManager();

    this.debounce = createDebounce(this.sideEffect);

    this.yText = this.doc.getText("monaco");

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
    this.sideEffect.flush();
  }

  private setupYDocPersistence(): void {
    const setAttrs = this.debounce(
      (): void => {
        const text = fromUint8Array(encodeStateAsUpdate(this.doc));
        if (text !== this.textAttr) {
          // @TODO handle large text
          this.context.updateAttributes(["text"], text);
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
        // Only the one who updates the yDoc (origin is yMonaco) writes to the shared App Attributes
        if (!this.isDocDestroyed && origin !== this) {
          setAttrs();
        }
      };
      this.doc.on("update", onDocUpdated);
      return () => this.doc.off("update", onDocUpdated);
    });
  }

  private sideEffect: SideEffectManager;
  private debounce: Debounce;

  private isDocDestroyed = false;
  private textAttr?: string;
}
