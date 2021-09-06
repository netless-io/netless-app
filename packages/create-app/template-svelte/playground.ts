import type { Room } from "white-web-sdk";
import { WhiteWebSdk } from "white-web-sdk";

import "@netless/window-manager/dist/style.css";
import { WindowManager } from "@netless/window-manager";
import TodoApp from "./src";

declare global {
  var room: Room;
  var manager: WindowManager;
}

const env = import.meta.env;
const $ = <T extends string>(sel: T) => document.querySelector(sel);
const $whiteboard = $("#whiteboard") as HTMLDivElement;

const search = new URLSearchParams(location.search);
if (search.has("uuid")) {
  env.VITE_ROOM_UUID = search.get("uuid")!;
}
if (search.has("roomToken")) {
  env.VITE_ROOM_TOKEN = search.get("roomToken")!;
}

function post(path: string, body: any) {
  return fetch(`https://api.netless.link/v5/${path}`, {
    method: "POST",
    headers: {
      token: env.VITE_TOKEN,
      region: "cn-hz",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

async function createRoom() {
  const { uuid } = await post("rooms", { name: "test1", limit: 0 });
  const roomToken = await post(`tokens/rooms/${uuid}`, { lifespan: 60000, role: "admin" });
  env.VITE_ROOM_UUID = uuid;
  env.VITE_ROOM_TOKEN = roomToken;
}

async function joinRoom() {
  const sdk = new WhiteWebSdk({
    appIdentifier: env.VITE_APPID,
    useMobXState: true,
  });

  if (!(env.VITE_ROOM_UUID && env.VITE_ROOM_TOKEN)) {
    await createRoom();
  }

  const room = await sdk.joinRoom({
    uuid: env.VITE_ROOM_UUID,
    roomToken: env.VITE_ROOM_TOKEN,
    invisiblePlugins: [WindowManager],
    useMultiViews: true,
  });

  window.room = room;
  room.setScenePath("/init");
  WindowManager.mount({ room, container: $whiteboard, chessboard: false });

  window.manager = room.getInvisiblePlugin(WindowManager.kind) as WindowManager;
  manager.switchMainViewToWriter();

  WindowManager.register({ kind: "TodoApp", src: TodoApp });

  $("#btn-add-app")?.addEventListener("click", () => {
    manager.addApp({ kind: "TodoApp" });
  });

  $("#btn-reset")?.addEventListener("click", async () => {
    await Promise.all(Object.keys(manager.apps || {}).map(appId => manager.closeApp(appId)));
    Object.keys(manager.attributes).forEach(key => {
      if (/-[-_a-zA-Z0-9]{8}$/.test(key)) {
        manager.updateAttributes([key], undefined);
      } else if (key === "apps") {
        manager.updateAttributes([key], {});
      }
    });
    manager.mainView.moveCamera({ centerX: 0, centerY: 0, scale: 1 });
  });

  $("#btn-new-page")?.addEventListener("click", () => {
    window.open(
      `${location.origin}${location.pathname}?uuid=${env.VITE_ROOM_UUID}&roomToken=${env.VITE_ROOM_TOKEN}`,
      "_blank"
    );
  });

  document.title += " - loaded.";
}

joinRoom();
