import type { GGBApplet, GGBAppletParameters } from "../types";

declare global {
  interface Window {
    GGBApplet: typeof GGBApplet;
  }
}

let getGGBAppletPromise: Promise<typeof GGBApplet> | undefined;

export default function getGGBApplet(): Promise<typeof GGBApplet> {
  if (window.GGBApplet) {
    return Promise.resolve(window.GGBApplet);
  } else if (getGGBAppletPromise) {
    return getGGBAppletPromise;
  } else {
    const script = document.createElement("script");
    getGGBAppletPromise = new Promise((resolve, reject) => {
      script.onload = () => resolve(window.GGBApplet);
      script.onerror = () => {
        getGGBAppletPromise = undefined;
        reject();
      };
    });
    script.src = "https://www.geogebra.org/apps/deployggb.js";
    document.head.appendChild(script);
    return getGGBAppletPromise;
  }
}

export const defaultParameters: GGBAppletParameters = {
  appName: "classic",
  showMenuBar: true,
  showAlgebraInput: true,
  showToolBar: true,
  customToolBar:
    "0 39 73 62 | 1 501 67 , 5 19 , 72 75 76 | 2 15 45 , 18 65 , 7 37 | 4 3 8 9 , 13 44 , 58 , 47 | 16 51 64 , 70 | 10 34 53 11 , 24  20 22 , 21 23 | 55 56 57 , 12 | 36 46 , 38 49  50 , 71  14  68 | 30 29 54 32 31 33 | 25 17 26 60 52 61 | 40 41 42 , 27 28 35 , 6",
  showToolBarHelp: false,
  showResetIcon: false,
  enableFileFeatures: false,
  enableLabelDrags: false,
  enableShiftDragZoom: true,
  enableRightClick: true,
  errorDialogsActive: false,
  allowStyleBar: false,
  preventFocus: false,
  useBrowserForJS: true,
  language: "en",
  borderColor: "transparent",
};
