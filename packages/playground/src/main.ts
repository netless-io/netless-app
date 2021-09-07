import type { Room } from "white-web-sdk";
import { WhiteWebSdk, ApplianceNames } from "white-web-sdk";

import "@netless/window-manager/dist/style.css";
import { WindowManager } from "@netless/window-manager";
import type { PlaygroundConfig, PlaygroundConfigs } from "../typings";

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
const persistStore = localStorage;

interface RoomItem {
  uuid: string;
  roomToken: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const post = (path: string, body: any) =>
  fetch(`https://api.netless.link/v5/${path}`, {
    method: "POST",
    headers: {
      token: env.VITE_TOKEN,
      region: "cn-hz",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then(r => r.json());

async function createRoom() {
  const { uuid } = await post("rooms", { name: "test1", limit: 0 });
  log(`uuid = %O`, uuid);
  const roomToken = await post(`tokens/rooms/${uuid}`, { lifespan: 0, role: "admin" });
  log(`roomToken = %O`, roomToken);
  const rooms = JSON.parse(persistStore.getItem("rooms") || "[]") as RoomItem[];
  rooms.unshift({ uuid, roomToken });
  persistStore.setItem("rooms", JSON.stringify(rooms));
  window.open(location.href, "_blank");
}

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

  const createEmergencyBtn = () => {
    const btn = document.createElement("button");
    btn.classList.add("reset-btn");
    btn.textContent = "RESET";
    btn.title = "remove all apps, reset camera";
    btn.addEventListener("click", async () => {
      // close all apps
      await Promise.all(Object.keys(manager.apps || {}).map(appId => manager.closeApp(appId)));
      // clear attributes
      Object.keys(manager.attributes).forEach(key => {
        // {kind}-{nanoid(8)}
        if (/-[-_a-zA-Z0-9]{8}$/.test(key)) {
          manager.updateAttributes([key], undefined);
        } else if (key === "apps") {
          manager.updateAttributes([key], {});
        }
      });
      // reset camera
      manager.mainView.moveCamera({ centerX: 0, centerY: 0, scale: 1 });
    });
    $tools.append(btn);
  };

  createEmergencyBtn();

  const createNewPageBtn = () => {
    const btn = document.createElement("button");
    btn.classList.add("new-page-btn");
    btn.textContent = "NEW ROOM";
    btn.title = "create new room and window.open, save as localStorage/rooms";
    btn.addEventListener("click", createRoom);
    $tools.append(btn);
  };

  createNewPageBtn();
}

async function setupApps() {
  const createBtn = (name: string, kind: string, callback: () => void) => {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.dataset.app = kind;
    btn.addEventListener("click", callback);
    $actions.append(btn);
  };

  const createCaption = (name: string) => {
    const caption = document.createElement("strong");
    caption.textContent = name;
    $actions.append(caption);
  };

  const configs = import.meta.glob("../../*/playground.ts");
  const apps = (await Promise.all(Object.values(configs).map(p => p()))) as {
    default: PlaygroundConfig | PlaygroundConfigs;
  }[];
  const sorted: PlaygroundConfigs[] = [];
  for (let { default: a } of apps) {
    if (!Array.isArray(a)) a = [a];
    sorted.push(a);
  }
  for (const a of sorted) {
    log("[register]", a[0].app.kind);
    createCaption(a[0].app.kind);
    let i = 1;
    for (const { app, ...restOptions } of a) {
      WindowManager.register({ kind: app.kind, src: app });
      createBtn(restOptions.options?.title || `${app.kind} ${i++}`, app.kind, () =>
        manager.addApp({ kind: app.kind, ...restOptions })
      );
    }
  }

  room.setScenePath("/init");
  WindowManager.mount({ room, container: $whiteboard, chessboard: false });
  manager.switchMainViewToWriter();

  document.title += " - loaded.";
}

const rooms = JSON.parse(persistStore.getItem("rooms") || "[]") as RoomItem[];

let item = rooms[0];
if (!item && env.VITE_ROOM_TOKEN && env.VITE_ROOM_UUID) {
  item = { uuid: env.VITE_ROOM_UUID, roomToken: env.VITE_ROOM_TOKEN };
}
if (!item) {
  document.title += ` - creating new room...`;
  createRoom().then(() => location.reload());
}

if (item) {
  // prettier-ignore
  sdk.joinRoom({
    ...item,
    invisiblePlugins: [WindowManager],
    useMultiViews: true,
    disableNewPencil: false,
    floatBar: true,
  }).then(room => {
    window.room = room;
    window.manager = room.getInvisiblePlugin(WindowManager.kind) as WindowManager;
    return setupTools(), setupApps();
  });
}
