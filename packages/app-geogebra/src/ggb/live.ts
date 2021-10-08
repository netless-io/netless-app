import type { AppletObject, ClientEvent } from "../types";

export type LiveAppEventType =
  | "evalGMContent"
  | "evalCommand"
  | "addToGroup"
  | "evalXML"
  | "setXML"
  | "select"
  | "deselect"
  | "addImage"
  | "addSlide"
  | "addObject"
  | "deleteObject"
  | "renameObject"
  | "setEditorState"
  | "removeSlide"
  | "moveSlide"
  | "selectSlide"
  | "clearSlide"
  | "pasteSlide"
  | "orderingChange"
  | "embeddedContentChanged"
  | "startAnimation"
  | "stopAnimation"
  | "groupObjects"
  | "ungroupObjects"
  | "addGeoToTV"
  | "removeGeoFromTV"
  | "setValuesOfTV"
  | "showPointsTV"
  | "lockTextElement"
  | "unlockTextElement"
  | "conflictResolution"
  | "viewChanged2D";

export type ViewProperties = Record<
  `inv${"X" | "Y"}scale` | `${"x" | "y"}Min` | "width" | "height",
  number
>;

export interface LiveAppEvent {
  readonly type: LiveAppEventType;
  readonly clientId: LiveAppOptions["clientId"];
  // some event's content/label may not be string, just ignore its type
  content?: string;
  label?: string;
  embedLabel?: string;
}

export type Disposer = () => void;

export interface ISyncService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly postMessage: <T = any>(message: T) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly addListener: <T = any>(listener: (message: T) => void) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly save: (state: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly load: () => string;
}

export type LiveAppOptions = ISyncService & {
  readonly clientId: number;
  /** used for conflict resolution, returns true if the clientId is the one to follow */
  readonly isDecider?: (clientId: number) => boolean;
  /** used for multiuser selections */
  readonly getColor?: (clientId: number) => string;

  /** from `appletOnLoad` or `getAppletObject` */
  readonly api: AppletObject;
  /** throttle timeout */
  readonly delay?: number;
  /** if the app is an embedded one, this field will have value */
  readonly embedLabel?: string;
};

interface ViewState {
  scale: number;
  x: number;
  y: number;
}

export default class LiveApp {
  readonly clientId: number;
  readonly api: AppletObject;

  readonly context: Pick<
    LiveAppOptions,
    "embedLabel" | "isDecider" | "getColor" | "save" | "load" | "postMessage" | "addListener"
  >;

  delay: number;
  /** labels that are in animation, don't sync them */
  currentAnimations: string[] = [];
  embeds: Record<string, LiveApp> = {};

  constructor(options: LiveAppOptions) {
    this.api = options.api;
    this.clientId = options.clientId;
    this.delay = options.delay ?? 200;
    this.context = options;
    setTimeout(() => {
      this.api.evalCommand("Pan(0,0)"); // trigger viewChanged2D
    }, this.delay);
  }

  createEvent(type: LiveAppEventType, content?: string, label?: string): LiveAppEvent {
    const event: LiveAppEvent = { type, content, clientId: this.clientId };
    if (this.context.embedLabel) event.embedLabel = this.context.embedLabel;
    if (label) event.label = label;
    return event;
  }

  private storageCallback = 0;

  sendEvent(type: LiveAppEventType, content?: string | null, label?: string | null): void {
    console.log("[GeoGebra] send:", type, label, content);
    this.context.postMessage(
      this.createEvent(type, content as string | undefined, label as string | undefined)
    );

    if (!this.storageCallback) {
      this.storageCallback = setTimeout(() => {
        this.context.save(this.api.getBase64());
        this.storageCallback = 0;
      }, this.delay);
    }
  }

  evalCommand(command: string): void {
    this.unregisterListeners();
    this.api.evalCommand(command);
    this.registerListeners();
  }

  evalXML(xml: string): void {
    this.unregisterListeners();
    this.api.evalXML(xml);
    this.api.updateConstruction();
    this.registerListeners();
    setTimeout(this.initAllEmbeds, 500);
  }

  setXML(xml: string): void {
    this.unregisterListeners();
    this.api.setXML(xml);
    this.api.updateConstruction();
    this.registerListeners();
  }

  initEmbed(label: string): void {
    if (this.embeds[label]) return;
    const calculators = this.api.getEmbeddedCalculators();
    if (!calculators) return;
    const calculator = calculators[label];
    if (calculator && "registerClientListener" in calculator) {
      const child = new LiveApp({
        ...this.context,
        clientId: this.clientId,
        api: calculator,
        embedLabel: label,
      });
      child.registerListeners();
      this.embeds[label] = child;
    }
  }

  initAllEmbeds = (): void => {
    for (const label of this.api.getAllObjectNames("embed")) {
      this.initEmbed(label);
    }
  };

  private objectsInWaiting: string[] = [];
  private updateCallback = 0;

  dispatchUpdates = (): void => {
    if (!this.updateCallback) {
      this.updateCallback = setTimeout(this._dispatchUpdates, this.delay);
    }
  };

  private _dispatchUpdates = () => {
    const { objectsInWaiting } = this;
    this.objectsInWaiting = [];

    for (const label of objectsInWaiting) {
      const calculators = this.api.getEmbeddedCalculators(true);
      const embed = calculators?.[label];

      if ((embed as unknown as { controller?: unknown })?.controller) {
        this.sendEvent("evalGMContent", (embed as unknown as { toJSON(): string }).toJSON(), label);
      }

      const command = this.api.getCommandString(label, false);
      if (command) {
        this.sendEvent("evalCommand", `${label} := ${command}`, label);
        const group = this.api.getObjectsOfItsGroup(label);
        if (group?.length) {
          this.sendEvent("addToGroup", label, group as unknown as string);
        }
      }

      if (!command || this.api.isMoveable(label)) {
        const xml = this.api.getXML(label);
        this.sendEvent("evalXML", xml, label);
      }

      this.sendEvent("select", label, true as unknown as string);
    }

    this.updateCallback = 0;
  };

  updateListener = (label: string): void => {
    if (
      (this.api.hasUnlabeledPredecessors(label) || this.api.isMoveable(label)) &&
      !this.currentAnimations.includes(label)
    ) {
      if (!this.objectsInWaiting.includes(label)) {
        this.objectsInWaiting.push(label);
        this.dispatchUpdates();
      }
    }
  };

  addListener = (label: string): void => {
    const image = this.api.getImageFileName(label);
    if (image) {
      const json = this.api.getFileJSON();
      for (const item of json.archive) {
        if (item.fileName.includes(image)) {
          this.sendEvent("addImage", JSON.stringify(item));
        }
      }
    }

    const xml = this.api.getXML(label);
    const definition = this.api.getCommandString(label);
    const algorithmXML = definition && this.api.getAlgorithmXML(label);
    this.sendEvent("addObject", algorithmXML || xml, label);

    this.sendEvent("deselect");
    this.sendEvent("select", label, true as unknown as string);
    setTimeout(() => this.initEmbed(label), 500);
  };

  removeListener = (label: string): void => {
    this.sendEvent("deleteObject", label);
    delete this.embeds[label];
  };

  renameListener = (oldName: string, newName: string): void => {
    this.sendEvent("renameObject", oldName, newName);
  };

  private lastEditingLabel: string | undefined;
  private isSyncingViewState = 0;

  startSyncViewState() {
    clearTimeout(this.isSyncingViewState);
    this.isSyncingViewState = setTimeout(this.stopSyncViewState, 1000);
  }

  stopSyncViewState = () => {
    this.isSyncingViewState = 0;
  };

  _flushViewState = () => {
    const { invXscale, invYscale, xMin, yMin } = JSON.parse(
      this.api.getViewProperties(0)
    ) as ViewProperties;
    const scale = 1 / invXscale;
    const x = -xMin / invXscale;
    const y = -yMin / invYscale;
    this.viewState = { scale, x, y };
    this.viewSyncCallback = 0;
    return this.viewState;
  };

  clientListener = (event: ClientEvent): void => {
    let label: string, content: string;
    const type = event.type;
    switch (type) {
      case "updateStyle":
        label = event.target;
        content = this.api.getXML(label);
        this.sendEvent("evalXML", content);
        break;

      case "editorStart":
        this.lastEditingLabel = event.target;
        break;

      case "editorKeyTyped":
        content = this.api.getEditorState();
        this.sendEvent("setEditorState", content, this.lastEditingLabel);
        break;

      case "editorStop":
        this.lastEditingLabel = void 0;
        this.sendEvent("setEditorState", JSON.stringify({ content: "" }));
        break;

      case "deselect":
        this.sendEvent("deselect", event.target);
        break;

      case "select":
        this.sendEvent("select", event.target);
        break;

      case "embeddedContentChanged" as unknown:
        label = (event as unknown as string[])[1];
        content = (event as unknown as string[])[2];
        this.sendEvent("embeddedContentChanged", content, label);
        break;

      case "undo":
      case "redo":
      case "addPolygonComplete":
        content = this.api.getXML();
        this.sendEvent("setXML", content);
        break;

      case "addSlide" as LiveAppEventType:
        this.sendEvent(type);
        break;

      case "removeSlide" as LiveAppEventType:
      case "moveSlide" as LiveAppEventType:
      case "selectSlide" as LiveAppEventType:
      case "clearSlide" as LiveAppEventType:
      case "orderingChange" as LiveAppEventType:
        content = (event as unknown as string[])[2];
        this.sendEvent(type, content);
        break;

      case "pasteSlide" as LiveAppEventType:
        ({ cardIdx: content, ggbFile: label } = event as unknown as {
          cardIdx: string;
          ggbFile: string;
        });
        this.sendEvent(type, content, label);
        break;

      case "startAnimation" as LiveAppEventType:
        label = (event as unknown as string[])[1];
        this.currentAnimations.push(label);
        this.sendEvent(type, label, label);
        break;

      case "stopAnimation" as LiveAppEventType:
        label = (event as unknown as string[])[1];
        this.currentAnimations.splice(this.currentAnimations.indexOf(label), 1);
        this.sendEvent(type, label, label);
        break;

      case "groupObjects" as LiveAppEventType:
      case "ungroupObjects" as LiveAppEventType:
        content = (event as unknown as { targets: string }).targets;
        this.sendEvent(type, content);
        break;

      case "pasteElmsComplete":
        content = (event as unknown as { targets: string[] }).targets
          .map(geo => this.api.getXML(geo))
          .join("");
        this.sendEvent("evalXML", content);
        break;

      case "addGeoToTV" as LiveAppEventType:
      case "removeGeoFromTV" as LiveAppEventType:
        content = (event as unknown as string[])[1];
        this.sendEvent(type, content);
        break;

      case "setValuesOfTV" as LiveAppEventType:
        content = (event as unknown as string[])[2];
        this.sendEvent(type, content);
        break;

      case "showPointsTV" as LiveAppEventType:
        ({ column: content, show: label } = event as unknown as { column: string; show: string });
        this.sendEvent(type, content, label);
        break;

      case "lockTextElement" as LiveAppEventType:
      case "unlockTextElement" as LiveAppEventType:
        content = (event as unknown as string[])[1];
        this.sendEvent(type, content);
        break;

      case "viewChanged2D":
        if (!this.viewSyncCallback) {
          if (this.isSyncingViewState || this.viewState.scale === 0) {
            this.viewSyncCallback = setTimeout(this._flushViewState, this.delay);
          } else {
            this.viewSyncCallback = setTimeout(this._sendViewSyncEvent, this.delay);
          }
        }
        break;

      case "mouseDown":
      case "deleteGeos":
      case "dragEnd":
        // ignore
        break;

      default:
        console.debug("[GeoGebra] unhandled event ", event.type, event);
    }
  };

  private viewSyncCallback = 0;
  private viewState: ViewState = { scale: 0, x: 0, y: 0 };
  private static readonly Threshold = 20;

  _sendViewSyncEvent = () => {
    this._flushViewState();
    this.sendEvent("viewChanged2D", JSON.stringify(this.viewState));
    this.viewSyncCallback = 0;
  };

  _delayedRegisterListeners = () => {
    this.registerListeners();
    this.viewSyncCallback = 0;
  };

  shouldSyncView(oldView: ViewState, scale: number, x: number, y: number) {
    return (
      Math.abs(scale - oldView.scale) > LiveApp.Threshold / 10 ||
      Math.abs(x - oldView.x) > LiveApp.Threshold ||
      Math.abs(y - oldView.y) > LiveApp.Threshold
    );
  }

  registerListeners(): void {
    this.api.registerUpdateListener(this.updateListener);
    this.api.registerRemoveListener(this.removeListener);
    this.api.registerAddListener(this.addListener);
    this.api.registerClientListener(this.clientListener);
    this.api.registerRenameListener(this.renameListener);
  }

  unregisterListeners(): void {
    this.api.unregisterUpdateListener(this.updateListener);
    this.api.unregisterRemoveListener(this.removeListener);
    this.api.unregisterAddListener(this.addListener);
    this.api.unregisterClientListener(this.clientListener);
    this.api.unregisterRenameListener(this.renameListener);
  }

  private conflictedObjects: string[] = [];

  dispatch = (last: LiveAppEvent): void => {
    const isConflict = this.conflictedObjects.includes(last.label as string);
    if (isConflict && "conflictResolution" !== (last.type as string)) {
      return;
    }

    const target = last.embedLabel ? this.embeds[last.embedLabel] : this;
    const type = last.type;
    const label = last.label as string;
    const content = last.content as string;

    console.debug("[GeoGebra] receive:", type, label, content);

    if (type === "addObject") {
      if (target.api.exists(label)) {
        if (this.context.isDecider) {
          if (this.context.isDecider(this.clientId)) {
            let counter = 1;
            let newLabel: string;
            do {
              newLabel = `${label}_${counter}`;
              counter++;
            } while (target.api.exists(newLabel));
            this.unregisterListeners();
            target.api.renameObject(label, newLabel);
            this.registerListeners();
            const xml = target.api.getAlgorithmXML(newLabel) || target.api.getXML(newLabel);
            this.sendEvent("conflictResolution", xml, label);
          } else {
            this.conflictedObjects.push(label);
          }
        } else {
          target.evalXML(content);
          target.api.previewRefresh();
        }
      } else {
        target.evalXML(content);
        target.api.previewRefresh();
      }
    } else if (type === "conflictResolution") {
      const i = this.conflictedObjects.indexOf(label);
      if (i !== -1) this.conflictedObjects.splice(i, 1);
      target.evalXML(content);
      target.api.previewRefresh();
    } else if (type === "evalXML") {
      target.evalXML(content);
      target.api.previewRefresh();
    } else if (type === "setXML") {
      target.setXML(content);
    } else if (type === "evalCommand") {
      target.evalCommand(content);
      target.api.previewRefresh();
    } else if (type === "deleteObject") {
      target.unregisterListeners();
      if (target === this) delete this.embeds[content];
      target.api.deleteObject(content);
      target.registerListeners();
    } else if (type === "setEditorState") {
      target.unregisterListeners();
      target.api.setEditorState(content, label);
      target.registerListeners();
    } else if (type === "addImage") {
      const file = JSON.parse(content);
      target.api.addImage(file.fileName, file.fileContent);
    } else if (["addSlide", "removeSlide", "moveSlide", "clearSlide"].includes(type)) {
      target.api.handleSlideAction(type, content);
    } else if (type === "selectSlide") {
      target.unregisterListeners();
      target.api.selectSlide(content);
      target.registerListeners();
    } else if (type === "renameObject") {
      target.unregisterListeners();
      target.api.renameObject(content, label);
      target.registerListeners();
    } else if (type === "pasteSlide") {
      target.api.handleSlideAction(type, content, label);
    } else if (type === "evalGMContent") {
      const gmApi = (target.api.getEmbeddedCalculators(true) || {})[label];
      if (gmApi) (gmApi as unknown as { loadFromJSON(json: string): void }).loadFromJSON(content);
    } else if (type === "startAnimation") {
      target.api.setAnimating(label, true);
      target.api.startAnimation();
    } else if (type === "stopAnimation") {
      target.api.setAnimating(label, false);
    } else if (type === "select") {
      if (content) {
        const color = this.context.getColor?.(last.clientId) || "#80808080";
        target.api.addMultiuserSelection(String(last.clientId), color, content, !!label);
      }
    } else if (type === "deselect") {
      target.api.removeMultiuserSelections(String(last.clientId));
    } else if (type === "orderingChange") {
      target.api.updateOrdering(content);
    } else if (type === "groupObjects") {
      target.api.groupObjects(content as unknown as string[]);
    } else if (type === "ungroupObjects") {
      target.api.ungroupObjects(content as unknown as string[]);
    } else if (type === "addToGroup") {
      target.api.addToGroup(content, label as unknown as string[]);
    } else if (type === "embeddedContentChanged") {
      target.api.setEmbedContent(label, content);
    } else if (type === "addGeoToTV") {
      target.api.addGeoToTV(content);
    } else if (type === "setValuesOfTV") {
      target.api.setValuesOfTV(content);
    } else if (type === "removeGeoFromTV") {
      target.api.removeGeoFromTV(content);
    } else if (type === "showPointsTV") {
      target.api.showPointsTV(content, label);
    } else if (type === "lockTextElement") {
      target.api.lockTextElement(content);
    } else if (type === "unlockTextElement") {
      target.api.unlockTextElement(content);
    } else if (type === "viewChanged2D") {
      if (target.viewState.scale === 0) {
        target.api.evalCommand("Pan(0,0)");
        target.startSyncViewState();
      } else {
        const { scale, x, y } = JSON.parse(content) as ViewState;
        const v = target._flushViewState();
        target.startSyncViewState();
        target.api.evalCommand(`Pan(${x - v.x},${y - v.y})`);
        target.api.evalCommand(`ZoomIn(${scale / v.scale})`);
      }
    } else {
      console.debug("[GeoGebra] unknown event", type, content, label);
    }
  };
}
