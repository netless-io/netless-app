/**
 * @link https://wiki.geogebra.org/en/Reference:GeoGebra_Apps_API
 */
export interface AppletObject {
  remove(): void;
  getXML(objName?: string): string;
  getAlgorithmXML(objName: string): string;
  getPerspectiveXML(): string;
  getBase64: {
    (callback?: (base64string: string) => void): string;
    (includeThumbnail?: boolean, callback?: (base64string: string) => void): string;
  };
  setBase64(base64string: string, callback: () => void): void;
  openFile(filename: string, callback: () => void): void;
  login(token: string, ui: boolean): void;
  logout(): void;
  setXML(xml: string): void;
  evalXML(xmlString: string): void;
  setDisplayStyle(objName: string, style: string): void;
  evalCommand(cmdString: string): boolean;
  evalCommandGetLabels(cmdString: string): string;
  asyncEvalCommand(cmdString: string): Promise<string>;
  asyncEvalCommandGetLabels(cmdString: string): Promise<string>;
  evalCommandCAS(cmdString: string): string;
  evalGeoGebraCAS(cmdString: string): string;
  setFixed(objName: string, flag: boolean, selection?: boolean): void;
  isFixed(objName: string): boolean;
  isSelectionAllowed(objName: string): boolean;
  setOnTheFlyPointCreationActive(flag: boolean): void;
  setUndoPoint(): void;
  setSaved(): void;
  isSaved(): boolean;
  startSaveCallback(title: string, visibility: string, callbackAction: string): void;
  initCAS(): void;
  setErrorDialogsActive(flag: boolean): void;
  reset(): void;
  refreshViews(): void;
  setVisible(objName: string, visible: boolean): void;
  getVisible(objName: string, view?: number): boolean;
  setLayer(objName: string, layer: number): void;
  getLayer(objName: string): number;
  setLayerVisible(layer: number, visible: boolean): void;
  setTrace(objName: string, flag: boolean): void;
  isTracing(objName: string): boolean;
  setLabelVisible(objName: string, visible: boolean): void;
  setLabelStyle(objName: string, style: number): void;
  getLabelStyle(objName: string): number;
  getLabelVisible(objName: string): boolean;
  setColor(objName: string, red: number, green: number, blue: number): void;
  setCorner(objName: string, x: number, y: number, index?: number): void;
  setLineStyle(objName: string, style: number): void;
  setLineThickness(objName: string, thickness: number): void;
  setPointStyle(objName: string, style: number): void;
  setPointSize(objName: string, style: number): void;
  setFilling(objName: string, filling: number): void;
  getColor(objName: string): string;
  getPenColor(): string;
  getPenSize(): number;
  setPenSize(size: number): void;
  setPenColor(red: number, green: number, blue: number): void;
  getFilling(objName: string): number;
  getImageFileName(objName: string): string;
  getLineStyle(objName: string): number;
  getLineThickness(objName: string): number;
  getPointStyle(objName: string): number;
  getPointSize(objName: string): number;
  deleteObject(objName: string): void;
  setAnimating(objName: string, animate: boolean): void;
  setAnimationSpeed(objName: string, speed: number): void;
  startAnimation(): void;
  stopAnimation(): void;
  setAuxiliary(objName: string, auxiliary: boolean): void;
  hideCursorWhenDragging(hideCursorWhenDragging: boolean): void;
  isAnimationRunning(): boolean;
  getFrameRate(): number;
  renameObject(oldName: string, newName: string, force?: boolean): boolean;
  exists(objName: string): boolean;
  isDefined(objName: string): boolean;
  getValueString(objName: string, localized?: boolean): string;
  getListValue(objName: string, index: number): number;
  getDefinitionString(objName: string, localized?: boolean): string;
  getLaTeXString(objName: string): string;
  getLaTeXBase64(objName: string, value: boolean): string;
  getCommandString(objName: string, localized?: boolean): string;
  getCaption(objName: string, subst?: boolean): string;
  setCaption(objName: string, caption: string): void;
  getXcoord(objName: string): number;
  getYcoord(objName: string): number;
  getZcoord(objName: string): number;
  setCoords(objName: string, x: number, y: number, z: number): void;
  getValue(objName: string): number;
  getVersion(): string;
  getScreenshotBase64(callback: (data: string) => void, scale?: number): void;
  getThumbnailBase64(): string;
  setValue(objName: string, x: number): void;
  setTextValue(objName: string, x: string): void;
  setListValue(objName: string, x: number | boolean, y: number | boolean): void;
  setRepaintingActive(flag: boolean): void;
  setAxesVisible: {
    (x: boolean, y: boolean): void;
    (view: number, x: boolean, y: boolean, z: boolean): void;
  };
  setAxisUnits(view: number, x: string, y: string, z: string): void;
  setAxisLabels(view: number, x: string, y: string, z: string): void;
  setAxisSteps(view: number, x: string, y: string, z: string): void;
  getAxisUnits(view: number): string[];
  getAxisLabels(view: number): string[];
  setPointCapture(view: number, capture?: number): void;
  getGridVisible(view?: number): boolean;
  setGridVisible: {
    (visible: boolean): void;
    (view: number, visible?: boolean): void;
  };
  getAllObjectNames(objectType?: string): string[];
  getObjectNumber(): number;
  getObjectName(i: number): string;
  getObjectType(objName: string): string;
  setMode(mode: number): void;
  getMode(): number;
  getToolName(i: number): string;
  openMaterial(material: string): void;
  undo(): void;
  redo(): void;
  newConstruction(): void;
  resetAfterSaveLoginCallbacks(): void;
  debug(str: string): void;
  setWidth(width: number): void;
  setHeight(height: number): void;
  setSize(width: number, height: number): void;
  enableRightClick(enable: boolean): void;
  enableLabelDrags(enable: boolean): void;
  enableShiftDragZoom(enable: boolean): void;
  showToolBar(show: boolean): void;
  setCustomToolBar(toolbarDef: string): void;
  showMenuBar(show: boolean): void;
  showAlgebraInput(show: boolean): void;
  showResetIcon(show: boolean): void;
  getViewProperties(view: number): string;
  setFont(label: string, size: number, bold: boolean, italic: boolean, serif: boolean): void;
  insertImage(url: string, corner1: string, corner2: string, corner4: string): string;
  addImage(fileName: string, urlOrSvgContent: string): void;
  recalculateEnvironments(): void;
  isIndependent(label: string): boolean;
  isMoveable(label: string): boolean;
  setPerspective(code: string): void;
  enableCAS(enable: boolean): void;
  enable3D(enable: boolean): void;
  getFileJSON(thumbnail?: boolean): { archive: { fileName: string; fileContent: string }[] };
  setFileJSON(zip: { archive: { fileName: string; fileContent: string }[] }): void;
  setLanguage(lang: string): void;
  showTooltip(tooltip: boolean): void;
  addMultiuserSelection(user: string, color: string, label: string, newGeo: boolean): void;
  removeMultiuserSelections(user: string): void;
  getExerciseFraction(): number;
  isExercise(): boolean;
  setExternalPath(path: string): void;
  checkSaved(path: () => void): void;
  getCASObjectNumber(): number;
  exportPGF(callback: (data: string) => void): void;
  exportSVG: {
    (filename: string): void;
    (callback: (svg: string) => void): void;
  };
  exportPDF: {
    (scale: number, filename: string, sliderLabel: string): void;
    (scale: number, callback: (pdf: string) => void, sliderLabel: string): void;
  };
  exportPSTricks(callback: (data: string) => void): void;
  exportAsymptote(callback: (data: string) => void): void;
  setRounding(digits: string): void;
  getRounding(): string;
  copyTextToClipboard(text: string): void;
  evalLaTeX(text: string, mode: number): void;
  evalMathML(text: string): boolean;
  getScreenReaderOutput(text: string): string;
  getEditorState(): string;
  setEditorState(state: string, label: string): void;
  translate(arg1: string, callback: (data: string) => void): string;
  exportConstruction(flags: string[]): string;
  updateConstruction(): void;
  getConstructionSteps(breakpoints?: boolean): number;
  setConstructionStep(n: number, breakpoints?: boolean): void;
  previousConstructionStep(): void;
  nextConstructionStep(): void;
  getEmbeddedCalculators(includeGraspableMath?: boolean): Record<string, AppletObject>;
  getFrame(): HTMLElement;
  enableFpsMeasurement(): void;
  disableFpsMeasurement(): void;
  testDraw(): void;
  startDrawRecording(): void;
  endDrawRecordingAndLogResults(): void;
  registerAddListener(JSFunctionName: string | ((objName: string) => void)): void;
  unregisterAddListener(JSFunctionName: string | ((objName: string) => void)): void;
  registerStoreUndoListener(JSFunctionName: string | (() => void)): void;
  unregisterStoreUndoListener(JSFunctionName: string | (() => void)): void;
  registerRemoveListener(JSFunctionName: string | ((objName: string) => void)): void;
  unregisterRemoveListener(JSFunctionName: string | ((objName: string) => void)): void;
  registerClearListener(JSFunctionName: string | (() => void)): void;
  unregisterClearListener(JSFunctionName: string | (() => void)): void;
  registerRenameListener(
    JSFunctionName: string | ((oldName: string, newName: string) => void)
  ): void;
  unregisterRenameListener(
    JSFunctionName: string | ((oldName: string, newName: string) => void)
  ): void;
  registerUpdateListener(JSFunctionName: string | ((objName: string) => void)): void;
  unregisterUpdateListener(JSFunctionName: string | ((objName: string) => void)): void;
  registerClientListener(JSFunctionName: string | ((event: ClientEvent) => void)): void;
  unregisterClientListener(JSFunctionName: string | ((event: ClientEvent) => void)): void;
  registerObjectUpdateListener(
    objName: string,
    JSFunctionName: string | ((objName: string) => void)
  ): void;
  unregisterObjectUpdateListener(objName: string): void;
  registerObjectClickListener(objName: string, JSFunctionName: string | (() => void)): void;
  unregisterObjectClickListener(objName: string): void;
  registerClickListener(JSFunctionName: string | ((objName: string) => void)): void;
  unregisterClickListener(JSFunctionName: string | ((objName: string) => void)): void;
  handleSlideAction(eventType: string, pageIdx: string, appState?: string): void;
  selectSlide(pageIdx: string): void;
  updateOrdering(labels: string): void;
  previewRefresh(): void;
  groupObjects(objects: string[]): void;
  ungroupObjects(objects: string[]): void;
  getObjectsOfItsGroup(object: string): string[];
  addToGroup(item: string, objectsInGroup: string[]): void;
  setEmbedContent(label: string, base64: string): void;
  addGeoToTV(label: string): void;
  removeGeoFromTV(label: string): void;
  setValuesOfTV(values: string): void;
  showPointsTV(column: string, show: string): void;
  hasUnlabeledPredecessors(label: string): boolean;
  lockTextElement(label: string): void;
  unlockTextElement(label: string): void;
}

/**
 * @link https://wiki.geogebra.org/en/Reference:GeoGebra_Apps_API#Client_Events
 */
export type ClientEvent =
  // when new macro is added, `argument`: macro name
  | { type: "addMacro"; argument: string }
  // polygon construction started
  | { type: "addPolygon" }
  // polygon construction finished, `target`: polygon label
  | { type: "addPolygonComplete"; target: string }
  // Graphing / Geometry apps: algebra tab selected in sidebar
  | { type: "algebraPanelSelected" }
  // multiple objects deleted
  | { type: "deleteGeos" }
  // one or all objects removed from selection, `target`: object name (for single object) or null (deselect all)
  | { type: "deselect"; target: string | null }
  // mouse drag ended
  | { type: "dragEnd" }
  // dropdown list closed, `target`: dropdown list name, `index` index of selected item (0 based) */
  | { type: "dropdownClosed"; target: string; index: number }
  // dropdown list item focused using mouse or keyboard, `target`: dropdown list name, `index` index of focused item (0 based) */
  | { type: "dropdownItemFocused"; target: string; index: number }
  // dropdown list opened, `target`: dropdown list name
  | { type: "dropdownOpened"; target: string }
  // key typed in editor (Algebra view of any app or standalone Evaluator app),
  | { type: "editorKeyTyped" }
  // user moves focus to the editor  (Algebra view of any app or standalone Evaluator app), `target:` object label if editing existing object
  | { type: "editorStart"; target?: string }
  // user (Algebra view of any app or standalone Evaluator app), `target`: object label if editing existing object
  | { type: "editorStop"; target?: string }
  // export started, `argument`: JSON encoded array including export format
  | { type: "export"; argument: string }
  // user pressed the mouse button, `x`: mouse x-coordinate, `y`: mouse y-coordinate
  | { type: "mouseDown"; x: number; y: number }
  // multiple objects move ended, `argument`: object labels
  | { type: "movedGeos"; argument: string[] }
  // multiple objects are being moved, `argument`: object labels
  | { type: "movingGeos"; argument: string[] }
  // dialog is opened (currently just for export dialog), `argument`: dialog ID
  | { type: "openDialog"; argument: string }
  // main menu or one of its submenus were open, `argument`: submenu ID
  | { type: "openMenu"; argument: string }
  // pasting multiple objects started, `argument`: pasted objects as XML
  | { type: "pasteElms"; argument: string }
  // pasting multiple objects ended,
  | { type: "pasteElmsComplete" }
  // perspective changed (e.g. a view was opened or closed),
  | { type: "perspectiveChange" }
  // redo button pressed,
  | { type: "redo" }
  // relation tool  used, `argument`: HTML description of the object relation
  | { type: "relationTool"; argument: string }
  // custom tool removed, `argument`: custom tool name
  | { type: "removeMacro"; argument: string }
  // object renaming complete (in case of chain renames),
  | { type: "renameComplete" }
  // custom tool was renamed, `argument`: array [old name, new name]
  | { type: "renameMacro"; argument: [oldName: string, newName: string] }
  // object added to selection, `target`: object label
  | { type: "select"; target: string }
  // app mode changed (e.g. a tool was selected), `argument`: mode number (see toolbar reference for details)
  | { type: "setMode"; argument: string }
  // navigation bar visibility changed, `argument`: "true" or "false"
  | { type: "showNavigationBar"; argument: string }
  // style bar visibility changed, `argument`: "true" or "false"
  | { type: "showStyleBar"; argument: string }
  // side panel (where algebra view is in Graphing Calculator) closed,
  | { type: "sidePanelClosed" }
  // side panel (where algebra view is in Graphing Calculator) opened,
  | { type: "sidePanelOpened" }
  // table of values panel selected,
  | { type: "tablePanelSelected" }
  // tools panel selected,
  | { type: "toolsPanelSelected" }
  // undo pressed,
  | { type: "undo" }
  // object style changed, `target`: object label
  | { type: "updateStyle"; target: string }
  // graphics view dimensions changed by zooming or panning, `xZero`: horizontal pixel position of point (0,0), `yZero`: vertical pixel position of point (0,0), `xscale`: ratio pixels / horizontal units, `yscale`: ratio pixels / vertical units, `viewNo`: graphics view number (1 or 2)
  | {
      type: "viewChanged2D";
      xZero: number;
      yZero: number;
      scale: number;
      yscale: number;
      viewNo: 1 | 2;
    }
  // 3D view dimensions changed by zooming or panning, similar to 2D, e.g. `xZero: 0,yZero: 0,scale: 50,yscale: 50,viewNo: 512,zZero: -1.5,zscale: 50,xAngle: -40,zAngle: 24`
  | {
      type: "viewChanged3D";
      xZero: number;
      yZero: number;
      zZero: number;
      scale: number;
      yscale: number;
      zscale: number;
      xAngle: number;
      zAngle: number;
      viewNo: 1 | 2;
    };
