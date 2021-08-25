import { WhiteWebSdk, Room, ApplianceNames } from "white-web-sdk";

import "@netless/window-manager/dist/style.css";
import { WindowManager } from "@netless/window-manager";

declare global {
  var room: Room;
  var manager: WindowManager;
}

const env = import.meta.env;

const log = console.debug.bind(console);
const $ = <T extends string>(sel: T) => document.querySelector(sel);
let $tools = $("#tools")! as HTMLDivElement;
let $whiteboard = $("#whiteboard")! as HTMLDivElement;
let $actions = $("#actions")! as HTMLDivElement;
let store = sessionStorage;

let sdk = new WhiteWebSdk({
  appIdentifier: env.VITE_APPID,
  useMobXState: false,
});

function setupTools() {
  let btns: HTMLButtonElement[] = [];

  const refresh = () => {
    let current = room.state.memberState.currentApplianceName;
    for (let btn of btns) {
      if (btn.dataset.name === current) {
        btn.style.color = "red";
      } else {
        btn.style.color = "";
      }
    }
  };

  const createBtn = (name: ApplianceNames) => {
    let btn = document.createElement("button");
    btn.textContent = name;
    btn.dataset.name = name;
    btn.addEventListener("click", () => {
      store.setItem("currentApplianceName", name);
      room.setMemberState({ currentApplianceName: name });
      refresh();
    });
    $tools.append(btn);
    btns.push(btn);
  };

  for (let name of Object.values(ApplianceNames)) {
    createBtn(name);
  }

  let saved = store.getItem("currentApplianceName") as ApplianceNames;
  if (saved) room.setMemberState({ currentApplianceName: saved });
  refresh();
}

async function setupApps() {
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
    log("[register]", a[0].app.kind);
    for (let { app, ...restOptions } of a) {
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
  manager.switchMainViewToWriter();

  document.title += " - loaded.";
}

// prettier-ignore
sdk.joinRoom({
  roomToken: env.VITE_ROOM_TOKEN,
  uuid: env.VITE_ROOM_UUID,
  invisiblePlugins: [WindowManager],
  useMultiViews: true,
  disableNewPencil: false,
  floatBar: true,
}).then(room => {
  window.room = room;
  window.manager = room.getInvisiblePlugin(WindowManager.kind) as WindowManager;
  return setupTools(), setupApps();
});
