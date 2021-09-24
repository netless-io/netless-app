/* eslint-disable @typescript-eslint/no-explicit-any */

export declare class GGBApplet {
  constructor(params: Record<string, any>, html5NoWebSimple?: boolean);
  inject(el: HTMLElement): void;
}

export type ActionListener = (el?: string) => void;

export interface GGBFileJSON {
  archive: {
    fileName: string;
    fileContent: string;
  }[];
}

export interface GGBAppletObject {
  setWidth(width: number): void;
  setHeight(height: number): void;

  getBase64(): string;
  setBase64(base64: string): void;

  getFileJSON(): GGBFileJSON;
  setFileJSON(json: GGBFileJSON): void;

  registerAddListener(listener: ActionListener): void;
  registerRemoveListener(listener: ActionListener): void;
  registerRenameListener(listener: ActionListener): void;
  registerUpdateListener(listener: ActionListener): void;
  registerClearListener(listener: ActionListener): void;
  registerStoreUndoListener(listener: ActionListener): void;
}

let scriptEl: HTMLScriptElement | undefined;
let resolver: Promise<typeof GGBApplet> | undefined;

export function ensureGeoGebraAPI(): Promise<typeof GGBApplet> {
  if ((window as any).GGBApplet) {
    return Promise.resolve<typeof GGBApplet>((window as any).GGBApplet as typeof GGBApplet);
  } else if (resolver) {
    return resolver;
  } else {
    scriptEl = document.createElement("script");
    resolver = new Promise<typeof GGBApplet>(resolve => {
      (scriptEl as HTMLScriptElement).addEventListener("load", () =>
        resolve((window as any).GGBApplet)
      );
    });
    scriptEl.src = "https://www.geogebra.org/apps/deployggb.js";
    document.head.appendChild(scriptEl);
    return resolver;
  }
}
