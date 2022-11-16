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
  uid: string;
  ggbBase64: string;
}

export interface AppOptions {
  deployggb?: string;
  HTML5Codebase?: string;
}

interface UserPayload {
  uid: string;
  nickName: string;
}

/**
 * NOTE: GeoGebra is licensed under GPLv3 and is free only in non-commercial use.
 * If you want to use it, please refer to their license first:
 * https://www.geogebra.org/license
 *
 * KNOWN ISSUE: The GeoGebra sync is based on sending & receiving data about
 * partial info of the full picture, this can cause errors because of the order
 * of executing them.
 */
const GeoGebra: NetlessApp<Attributes, {}, AppOptions> = {
  kind: "GeoGebra",
  config: {
    enableShadowDOM: false,
  },
  async setup(context) {
    const displayer = context.displayer;
    const memberId = displayer.observerId;
    const userPayload: UserPayload | undefined = displayer.state.roomMembers.find(
      member => member.memberId === memberId
    )?.payload as UserPayload;
    const uid = userPayload?.uid || "";
    const nickName = userPayload?.nickName || uid;

    const appOptions = context.getAppOptions() || {};
    const deployggb = appOptions.deployggb;
    const codebase = appOptions.HTML5Codebase;

    const attrs = ensureAttributes(context, {
      uid: "",
      ggbBase64: "",
    });

    const box = context.box;
    box.mountStyles(styles);

    const content = document.createElement("div");
    content.classList.add("netless-app-geogebra", "loading");
    if (uid !== attrs.uid && attrs.uid) {
      content.classList.add("netless-app-geogebra", "readonly");
    }
    box.mountContent(content);

    const sideEffectManager = new SideEffectManager();

    const params: GGBAppletParameters = { ...defaultParameters };
    params.language = navigator.language.startsWith("zh") ? "zh" : "en";
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

      const displayer = context.displayer;
      const liveApp = new LiveApp({
        clientId: displayer.observerId,
        nickName,
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

    const GGBApplet = await getGGBApplet({ deployggb });
    const applet = new GGBApplet(params);
    if (codebase) {
      applet.setHTML5Codebase(codebase);
    }
    applet.inject(content);
  },
};

export default GeoGebra;
