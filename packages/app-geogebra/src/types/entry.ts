import type { AppletObject } from "./api";
import type { AppletParameters } from "./params";

export type AppletType = "preferJava" | "preferHTML5" | "java" | "html5" | "auto" | "screenshot";

export type Views = Record<
  "is3D" | "AV" | "SV" | "CV" | "EV2" | "CP" | "PC" | "DA" | "FI" | "PV" | "macro",
  boolean
>;

export type GGBAppletParameters = AppletParameters & {
  material_id?: string;
  appletOnLoad?: (api: AppletObject) => void;
};

export declare class GGBApplet {
  constructor(
    version?: number | string,
    parameters?: GGBAppletParameters,
    html5NoWebSimple?: boolean
  );
  constructor(parameters?: GGBAppletParameters, html5NoWebSimple?: boolean);

  /**
   * Overrides the codebase for HTML5.
   * @param codebase Can be an URL or a local file path.
   * @param offline Set to true, if the codebase is a local URL and no web URL
   */
  setHTML5Codebase(codebase: string, offline?: boolean): void;

  /** @deprecated not supported */
  setJavaCodebase(): void;
  /** @deprecated not supported */
  setJavaCodebaseVersion(): void;
  /** @deprecated not supported */
  isCompiledInstalled(): void;
  /** @deprecated not supported */
  setPreCompiledScriptPath(): void;
  /** @deprecated not supported */
  setPreCompiledResourcePath(): void;

  /**
   * Overrides the codebase version for HTML5.
   * If another codebase than the default codebase should be used, this method has to be called before setHTML5Codebase.
   * @param version The version of the codebase that should be used for HTML5 applets.
   */
  setHTML5CodebaseVersion(version: number | string, offline?: boolean): void;

  getHTML5CodebaseVersion(): string;
  getParameters(): GGBAppletParameters | undefined;
  setFontsCSSURL(url: string): void;

  inject(containerID: string | HTMLElement, type?: AppletType, noPreview?: boolean): void;
  inject(containerID: string | HTMLElement, noPreview?: boolean): void;

  getViews(): Views | null;

  isJavaInstalled(): false;
  isHTML5Installed(): true;

  getLoadedAppletType(): AppletType | null;
  setPreviewImage(previewFilePath: string, loadingFilePath: string, playFilePath: string): void;
  removeExistingApplet(appletParent: string, showScreenshot?: boolean): void;

  refreshHitPoints(): boolean;
  startAnimation(): boolean;
  stopAnimation(): boolean;

  getAppletObject(): AppletObject | undefined;
  resize(): void;
}
