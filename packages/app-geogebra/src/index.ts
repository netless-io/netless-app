import { ensureAttributes } from "@netless/app-shared";
import type { NetlessApp } from "@netless/window-manager";
import { SideEffectManager } from "side-effect-manager";
import getGGBApplet, { defaultParameters } from "./ggb";
import LiveApp from "./ggb/live";
import styles from "./style.scss?inline";
import type { AppletObject, GGBAppletParameters } from "./types";
import { createSyncService, onResize } from "./utils";

export type {
  AppletObject,
  AppletParameters,
  AppletType,
  ClientEvent,
  GGBApplet,
  GGBAppletParameters,
  Views,
} from "./types";

export interface Attributes {
  ggbBase64: string;
}

/**
 * NOTE: GeoGebra is licensed under GPLv3 and is free only in non-commercial use.
 * If you want to use it, please refer to their licence first:
 * https://www.geogebra.org/license
 */
const GeoGebra: NetlessApp<Attributes> = {
  kind: "GeoGebra",
  async setup(context) {
    const attrs = ensureAttributes(context, { ggbBase64: "" });

    const box = context.getBox();
    box.mountStyles(styles);

    const content = document.createElement("div");
    content.classList.add("netless-app-geogebra", "loading");
    box.mountContent(content);

    const sideEffectManager = new SideEffectManager();

    const params: GGBAppletParameters = { ...defaultParameters };
    if (attrs.ggbBase64) {
      params.ggbBase64 = attrs.ggbBase64;
    }

    params.id = "ggb_" + context.appId;

    let app: AppletObject | undefined;
    const sync = createSyncService(context, attrs, "ggbBase64");

    function resize() {
      const { width, height } = content.getBoundingClientRect();
      app?.setWidth(width);
      app?.setHeight(height);
    }

    params.appletOnLoad = api => {
      console.log(`[GeoGebra]: loaded ${JSON.stringify(params.id)}`);

      app = api;
      resize();
      content.classList.remove("loading");

      const displayer = context.getDisplayer();
      const liveApp = new LiveApp({
        clientId: displayer.observerId,
        api,
        isDecider: clientId => {
          const users = displayer.state.roomMembers.map(member => member.memberId);
          return users.every(id => clientId <= id);
        },
        getColor: clientId => {
          const color = displayer.memberState(clientId).strokeColor;
          return "#" + color.map(x => x.toString(16).padStart(2, "0")).join("") + "80";
        },
        ...sync.service,
      });

      liveApp.registerListeners();
      sync.service.addListener(e => {
        liveApp.dispatch(e);
        app?.setUndoPoint();
      });

      if (import.meta.env.DEV) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any)["ggb_live_" + context.appId] = liveApp;
        console.log(`[GeoGebra]: init live app of ${JSON.stringify(params.id)}`);
      }
    };

    sideEffectManager.add(() => onResize(content, resize));

    context.emitter.on("destroy", () => {
      console.log("[GeoGebra]: destroy");
      sideEffectManager.flushAll();
      sync.disposer();
      app?.remove();
    });

    const GGBApplet = await getGGBApplet();
    const applet = new GGBApplet(params);
    applet.inject(content);
  },
};

export default GeoGebra;
