import { WhiteWebSdk, Room, ApplianceNames } from "white-web-sdk";

import "@netless/window-manager/dist/style.css";
import { WindowManager } from "@netless/window-manager";

declare global {
  // eslint-disable-next-line no-var
  var room: Room;
  // eslint-disable-next-line no-var
  var manager: WindowManager;
}

const env = import.meta.env;

const log = console.debug.bind(console);
const $ = <T extends string>(sel: T) => document.querySelector(sel);
const $tools = $("#tools") as HTMLDivElement;
const $whiteboard = $("#whiteboard") as HTMLDivElement;
const $actions = $("#actions") as HTMLDivElement;
const store = sessionStorage;

const sdk = new WhiteWebSdk({
  appIdentifier: env.VITE_APPID,
  useMobXState: false,
});

function setupTools() {
  const btns: HTMLButtonElement[] = [];

  const refresh = () => {
    const current = room.state.memberState.currentApplianceName;
    for (const btn of btns) {
      if (btn.dataset.name === current) {
        btn.style.color = "red";
      } else {
        btn.style.color = "";
      }
    }
  };

  const createBtn = (name: ApplianceNames) => {
    const btn = document.createElement("button");
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

  for (const name of Object.values(ApplianceNames)) {
    createBtn(name);
  }

  const saved = store.getItem("currentApplianceName") as ApplianceNames;
  if (saved) room.setMemberState({ currentApplianceName: saved });
  refresh();
}

async function setupApps() {
  const createBtn = (name: string, kind: string, callback: () => void) => {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.dataset.app = kind;
    btn.addEventListener("click", callback);
    $actions.append(btn);
  };

  const configs = import.meta.glob("../../*/playground.ts");
  const apps = await Promise.all(Object.values(configs).map((p) => p()));
  for (let { default: a } of apps) {
    if (!Array.isArray(a)) {
      a = [a];
    }
    let i = 1;
    log("[register]", a[0].app.kind);
    for (const { app, ...restOptions } of a) {
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
