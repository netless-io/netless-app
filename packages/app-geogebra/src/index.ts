import { ensureAttributes } from "@netless/app-shared";
import type { NetlessApp } from "@netless/window-manager";
import type { GGBAppletObject, GGBFileJSON } from "./loader";
import { ensureGeoGebraAPI } from "./loader";
import styles from "./style.scss?inline";
import { SideEffectManager } from "side-effect-manager";

function scan(str: string, start: string, end: string, pos?: number): [i: number, j: number] {
  const i = str.indexOf(start, pos);
  const j = str.indexOf(end, i);
  return [i, j];
}

function replaceByScan(str: string, replace: string, start: string, end: string, pos?: number) {
  const [i, j] = scan(str, start, end, pos);
  const [k, l] = scan(replace, start, end, pos);
  return [str.slice(0, i) + replace.slice(k, l) + str.slice(j), j] as const;
}

function hackGeoGebraXML(me: string, incoming: string, pos = 0) {
  [me, pos] = replaceByScan(me, incoming, "<window", "/>", pos);
  [me, pos] = replaceByScan(me, incoming, `<pane location="" divider=`, "/>", pos);
  [me, pos] = replaceByScan(me, incoming, `visible="true"`, "/>", pos);
  [me, pos] = replaceByScan(me, incoming, `<size `, "/>", pos);
  [me, pos] = replaceByScan(me, incoming, `<coordSystem `, "/>", pos);
  return me;
}

export interface Attributes {
  [fileName: string]: string; // fileContent
}

const GeoGebra: NetlessApp<Attributes> = {
  kind: "GeoGebra",
  async setup(context) {
    const box = context.getBox();

    const attrs = ensureAttributes(context, {
      "geogebra_defaults2d.xml": "",
      "geogebra_defaults3d.xml": "",
      "geogebra_javascript.js": "",
      "geogebra.xml": "",
    });

    box.mountStyles(styles);
    const content = document.createElement("div");
    content.classList.add("netless-app-geogebra");
    box.mountContent(content);

    const sideEffect = new SideEffectManager();

    const GGBApplet = await ensureGeoGebraAPI();
    const api = await new Promise<GGBAppletObject>(resolve => {
      const applet = new GGBApplet({
        appName: "graphing",
        showToolBar: true,
        showAlgebraInput: true,
        showMenuBar: true,
        borderColor: null,
        useBrowserForJS: true,
        appletOnLoad: resolve,
      });
      applet.inject(content);
    });

    const resizeObserver = new ResizeObserver(() => {
      const { width, height } = content.getBoundingClientRect();
      api.setWidth(width);
      api.setHeight(height);
    });

    resizeObserver.observe(content);

    const send = () => {
      const { archive } = api.getFileJSON();
      for (const { fileName, fileContent } of archive) {
        if (attrs[fileName] !== fileContent) {
          context.updateAttributes([fileName], fileContent);
        }
      }
    };

    let debounceSendTimer = 0;
    const debouncedSend = async () => {
      clearTimeout(debounceSendTimer);
      debounceSendTimer = setTimeout(send, 500);
    };

    const receive = () => {
      const archive: GGBFileJSON["archive"] = [];
      const old = Object.fromEntries(
        api.getFileJSON().archive.map(e => [e.fileName, e.fileContent])
      );
      const changed = new Map();
      for (const [key, value] of Object.entries(attrs)) {
        if (key in old) {
          if (key === "geogebra.xml") {
            old[key] = hackGeoGebraXML(old[key], value);
          }
          if (old[key] !== value) changed.set(key, [old[key], value]);
          archive.push({ fileName: key, fileContent: value });
        }
      }
      if (changed.size > 0) {
        // TODO: wtf
        console.log(changed);
        api.setFileJSON({ archive });
      }
    };

    let debounceReceiveTimer = 0;
    const debouncedReceive = () => {
      clearTimeout(debounceReceiveTimer);
      debounceReceiveTimer = setTimeout(receive, 500);
    };

    const watchedKeys = Object.keys(attrs);
    sideEffect.add(() =>
      context.mobxUtils.autorun(() => {
        watchedKeys.forEach(key => attrs[key]);
        debouncedReceive();
      })
    );

    api.registerAddListener(debouncedSend);
    api.registerClearListener(debouncedSend);
    api.registerRemoveListener(debouncedSend);
    api.registerRenameListener(debouncedSend);
    api.registerStoreUndoListener(debouncedSend);
    api.registerUpdateListener(debouncedSend);

    if (import.meta.env.DEV) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).geo = api;
    }

    context.emitter.on("destroy", () => {
      console.log("[GeoGebra]: destroy");
      sideEffect.flushAll();
    });
  },
};

export default GeoGebra;
