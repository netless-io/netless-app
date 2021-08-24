import { WhiteWebSdk, Room } from "white-web-sdk";

import "@netless/window-manager/dist/style.css";
import { WindowManager } from "@netless/window-manager";

import HelloWorld from "@netless/app-hello-world";

import DocsViewer from "@netless/app-docs-viewer";

WindowManager.register(HelloWorld);
WindowManager.register(DocsViewer);

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

  $("#btn-hello-world")!.addEventListener("click", () => {
    manager.addApp({ kind: HelloWorld.kind });
  });

  $("#btn-docs-viewer")!.addEventListener("click", () => {
    manager.addApp({
      kind: DocsViewer.kind,
      options: {
        scenePath: "/test4",
        title: "ppt1",
        scenes: [
          {
            name: "1",
            ppt: {
              height: 1010,
              src: "https://convertcdn.netless.link/staticConvert/18140800fe8a11eb8cb787b1c376634e/1.png",
              width: 714,
            },
          },
          {
            name: "2",
            ppt: {
              height: 1010,
              src: "https://convertcdn.netless.link/staticConvert/18140800fe8a11eb8cb787b1c376634e/2.png",
              width: 714,
            },
          },
        ],
      },
    });
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
