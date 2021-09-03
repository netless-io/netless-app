import type { Text, Doc } from "yjs";
import type { AppContext } from "@netless/window-manager";
import type { Event as WhiteEvent, RoomState } from "white-web-sdk";
import type { NetlessAppMonacoAttributes } from "./typings";
import type { Debounce } from "@netless/app-shared/create-debounce";
import { applyUpdate, encodeStateAsUpdate } from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { SideEffectManager } from "@netless/app-shared/SideEffectManager";
import { createDebounce } from "@netless/app-shared/create-debounce";
import { fromUint8Array, toUint8Array } from "js-base64";

export class NetlessAppAttributesProvider {
  public awareness: Awareness;

  public yText: Text;

  public constructor(
    public context: AppContext<NetlessAppMonacoAttributes>,
    public attrs: NetlessAppMonacoAttributes,
    public doc: Doc
  ) {
    this.awareness = new Awareness(this.doc);

    this.sideEffect = new SideEffectManager();

    this.debounce = createDebounce(this.sideEffect);

    this.yText = this.doc.getText("monaco");

    this.textAttr = attrs.text;

    if (this.textAttr) {
      applyUpdate(this.doc, toUint8Array(this.textAttr), this);
    }

    this.sideEffect.add(() => {
      const dispose = context.mobxUtils.autorun(() => {
        this.textAttr = attrs.text;
      });
      return dispose;
    });

    this.setupYDoc();
    this.setupYDocPersistence();
    this.setupAwareness();
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
        if (text !== this.textAttr) {
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

  private broadcastAwareness(ids: number[]): void {
    if (this.context.getIsWritable()) {
      const room = this.context.getRoom();
      if (room) {
        room.dispatchMagixEvent(
          "AppMonacoAwareness",
          fromUint8Array(encodeAwarenessUpdate(this.awareness, ids))
        );
      }
    }
  }

  private setupAwareness(): void {
    // const displayer = this.context.getDisplayer();
    // this.awareness.setLocalStateField('user', {
    //   name: displayer.state.roomMembers.find(member=> member.memberId === displayer.observerId)?.payload?.cursorName || '',
    //   color: `rgb(${displayer.memberState(displayer.observerId).strokeColor.join(',')})`
    // })

    this.sideEffect.add(() => {
      const handleStateChanged = (modifyState?: Partial<RoomState>): void => {
        if (modifyState?.roomMembers) {
          const nextRoomMemberIDs: number[] = [];
          const roomMemberNewIDs: number[] = [];
          modifyState.roomMembers.forEach(({ memberId }) => {
            nextRoomMemberIDs.push(memberId);
            if (!this.roomMemberIDs.delete(memberId)) {
              roomMemberNewIDs.push(memberId);
            }
          });
          if (nextRoomMemberIDs.length > 0) {
            this.roomMemberIDs = new Set(nextRoomMemberIDs);
          }
          if (roomMemberNewIDs.length > 0) {
            this.broadcastAwareness(Array.from(this.awareness.getStates().keys()));
          }
        }
      };

      const displayer = this.context.getDisplayer();
      displayer.callbacks.on("onRoomStateChanged", handleStateChanged);
      return () => displayer.callbacks.off("onRoomStateChanged", handleStateChanged);
    });

    this.broadcastAwareness([this.doc.clientID]);

    this.sideEffect.add(() => {
      const handleWritableChanged = () => {
        this.broadcastAwareness([this.doc.clientID]);
      };
      this.context.emitter.on("writableChange", handleWritableChanged);
      return () => this.context.emitter.off("writableChange", handleWritableChanged);
    });

    this.sideEffect.add(() => {
      const displayer = this.context.getDisplayer();
      const handleUpdate = (event: WhiteEvent) => {
        if (!this.isDocDestroyed && event.authorId !== displayer.observerId) {
          applyAwarenessUpdate(this.awareness, toUint8Array(event.payload), this);
        }
      };
      displayer.addMagixEventListener("AppMonacoAwareness", handleUpdate);
      return () => displayer.removeMagixEventListener("AppMonacoAwareness", handleUpdate);
    });

    this.sideEffect.add(() => {
      const handleUpdate = (
        {
          added,
          updated,
          removed,
        }: {
          added: number[];
          updated: number[];
          removed: number[];
        },
        origin: NetlessAppAttributesProvider
      ): void => {
        if (origin !== this) {
          this.broadcastAwareness([...added, ...updated, ...removed]);
        }
      };
      this.awareness.on("update", handleUpdate);
      return () => this.awareness.off("update", handleUpdate);
    });
  }

  private sideEffect: SideEffectManager;
  private debounce: Debounce;

  private isDocDestroyed = false;
  private textAttr?: string;
  private roomMemberIDs: Set<number> = new Set();
}
