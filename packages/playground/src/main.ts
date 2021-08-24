import { WhiteWebSdk, Room } from "white-web-sdk";

import "@netless/window-manager/dist/style.css";
import { WindowManager } from "@netless/window-manager";

import HelloWorld from "@netless/app-hello-world";

WindowManager.register(HelloWorld);

declare global {
  var room: Room;
  var manager: WindowManager;
}

const env = import.meta.env;

const $ = <T extends string>(sel: T) => document.querySelector(sel);
let $whiteboard = $("#whiteboard")! as HTMLDivElement;

let sdk = new WhiteWebSdk({ appIdentifier: env.VITE_APPID });

function setup() {
  room.setScenePath("/init");
  WindowManager.mount(room, $whiteboard);

  document.title += " - loaded.";

  $("#btn-hello-world").addEventListener("click", () => {
    manager.addApp({ kind: HelloWorld.kind });
  });
}

// prettier-ignore
sdk.joinRoom({
  roomToken: env.VITE_ROOM_TOKEN,
  uuid: env.VITE_ROOM_UUID,
  invisiblePlugins: [WindowManager],
  useMultiViews: true,
}).then(room => {
  window.room = room;
  window.manager = room.getInvisiblePlugin(WindowManager.kind) as WindowManager;
  setup()
});
