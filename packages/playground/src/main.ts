import { WhiteWebSdk, Room } from "white-web-sdk";

import "@netless/window-manager/dist/style.css";
import { WindowManager } from "@netless/window-manager";

declare global {
  var room: Room;
  var manager: WindowManager;
}

const env = import.meta.env;

const log = console.debug.bind(console);
const $ = <T extends string>(sel: T) => document.querySelector(sel);
let $whiteboard = $("#whiteboard")! as HTMLDivElement;
let $actions = $("#actions")! as HTMLDivElement;

let sdk = new WhiteWebSdk({ appIdentifier: env.VITE_APPID });

async function setup() {
  const createBtn = (name: string, kind: string, callback: () => void) => {
    let btn = document.createElement("button");
    btn.textContent = name;
    btn.dataset.app = kind;
    btn.addEventListener("click", callback);
    $actions.append(btn);
  };

  let configs = import.meta.glob("../../*/playground.ts");
  let apps = await Promise.all(Object.values(configs).map((p) => p()));
  for (let { default: a } of apps) {
    if (!Array.isArray(a)) {
      a = [a];
    }
    let i = 1;
    for (let { app, ...restOptions } of a) {
      log("register", app.kind);
      WindowManager.register(app);
      createBtn(
        restOptions.options?.title || `${app.kind} ${i++}`,
        app.kind,
        () => manager.addApp({ kind: app.kind, ...restOptions })
      );
    }
  }

  room.setScenePath("/init");
  WindowManager.mount(room, $whiteboard);

  document.title += " - loaded.";
}

// prettier-ignore
sdk.joinRoom({
  roomToken: env.VITE_ROOM_TOKEN,
  uuid: env.VITE_ROOM_UUID,
  invisiblePlugins: [WindowManager],
  useMultiViews: true,
  disableNewPencil: false
}).then(room => {
  window.room = room;
  window.manager = room.getInvisiblePlugin(WindowManager.kind) as WindowManager;
  setup()
});
