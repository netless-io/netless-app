/**
 * @link https://wiki.geogebra.org/en/Reference:GeoGebra_App_Parameters
 */
export interface AppletParameters {
  /** @default "ggbApplet" */
  id?: string;
  /** @default "" */
  filename?: string;
  /** @default "" */
  json?: string;
  /** @default true */
  enableLabelDrags?: boolean;
  /** @default true */
  enableUndoRedo?: boolean;
  /** @default true */
  enableRightClick?: boolean;
  /** @default false */
  enableCAS?: boolean;
  /** @default false */
  enable3D?: boolean;
  /** @default false */
  lockExam?: boolean;
  /** @default "" */
  rounding?: `${number}${"" | "s" | "r"}`;
  /** @default "" */
  ggbBase64?: string;
  /** @default false */
  showMenuBar?: boolean;
  /** @default false */
  showToolBar?: boolean;
  /** @default true */
  showToolBarHelp?: boolean;
  /** @link https://wiki.geogebra.org/en/Reference:Toolbar @default "" */
  customToolBar?: string;
  /** @default false */
  showAlgebraInput?: boolean;
  /** @default "algebra" */
  algebraInputPosition?: "algebra" | "top" | "bottom";
  /** @default false */
  showResetIcon?: boolean;
  /** @default true */
  showAnimationButton?: boolean;
  /** @default 3 */
  capturingThreshold?: number;
  /** @link https://www.wikiwand.com/en/List_of_ISO_639-1_codes @default "" */
  language?: string;
  /** @default "" */
  country?: string;
  /** @default false */
  useBrowserForJS?: boolean;
  /** @default true */
  enableShiftDragZoom?: boolean;
  /** @default 0 */
  width?: number;
  /** @default 0 */
  height?: number;
  /** @default false */
  fittoscreen?: boolean;
  /** @default "" */
  borderColor?: string;
  /** @default false */
  showLogging?: boolean;
  /** @default true */
  allowSymbolTable?: boolean;
  /** @default false */
  allowStyleBar?: boolean;
  /** @default false */
  app?: boolean;
  /** @default false */
  screenshotGenerator?: boolean;
  /** @default "" */
  laf?: string;
  /** @default false */
  preventFocus?: boolean;
  /** @link https://wiki.geogebra.org/en/SetPerspective_Command @default "" */
  perspective?: string;
  /** @default "classic" */
  appName?: "graphing" | "geometry" | "3d" | "classic" | "suite" | "evaluator" | "scientific";
  /** @default 1.0 */
  scale?: number;
  /** @default false */
  buttonShadows?: boolean;
  /** @default 0.2 */
  buttonRounding?: number;
  /** @default "#000000" */
  buttonBorderColor?: string;
  /** @default false */
  prerelease?: boolean;
  /** @default "" */
  tubeid?: string;
  /** @default false */
  showTutorialLink?: boolean;
  /** @default true */
  enableFileFeatures?: boolean;
  /** @default true */
  errorDialogsActive?: boolean;
  /** @default false */
  showAppsPicker?: boolean;
  /** @default false */
  showZoomButtons?: boolean;
  /** @default false */
  showFullscreenButton?: boolean;
  /** @default false */
  showSuggestionButtons?: boolean;
  /** @default false */
  showStartTooltip?: boolean;
  /** @default 0 */
  marginTop?: number;
  /** @default -1 */
  randomSeed?: number;
  /** @default "" */
  fontscssurl?: string;
  /** @default "" */
  scaleContainerClass?: string;
  /** @default false */
  allowUpscale?: boolean;
  /** @default false */
  playButton?: boolean;
  /** @default false */
  autoHeight?: boolean;
  /** @default false */
  disableAutoScale?: boolean;
  /** @default true */
  randomize?: boolean;
  /** @default "" */
  loginURL?: string;
  /** @default "" */
  logoutURL?: string;
  /** @default "" */
  backendURL?: string;
  /** @default "" */
  fullscreenContainer?: string;
  /** @default "" */
  shareLinkPrefix?: string;
  /** @default "" */
  vendor?: string;
  /** @default 0 */
  fontSize?: number;
  /** @default undefined */
  keyboardType?: "scientific" | "normal" | "notes";
  /** @default false */
  textMode?: boolean;
  /** @default "white" */
  editorBackgroundColor?: string;
  /** @default "black" */
  editorForegroundColor?: string;
  /** @default false */
  showSlides?: boolean;
  /** @default false */
  useLocalizedDigits?: boolean;
  /** @default true */
  useLocalizedPointNames?: boolean;
  /** @default "undef" */
  detachKeyboard?: string;
}
