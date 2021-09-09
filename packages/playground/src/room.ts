import faker from "faker";

import { WindowManager } from "@netless/window-manager";
import type { Room } from "white-web-sdk";
import { ApplianceNames, WhiteWebSdk } from "white-web-sdk";

import type { RoomInfo } from "./common";
import { clearQueryString, createRoom, env, persistStore } from "./common";

export const sdk = new WhiteWebSdk({
  appIdentifier: env.VITE_APPID,
  useMobXState: true,
});

export async function prepare(): Promise<RoomInfo | undefined> {
  let uuid: string | undefined;
  let roomToken: string | undefined;

  const query = new URLSearchParams(location.search);
  if (query.has("uuid") && query.has("roomToken")) {
    uuid = query.get("uuid") as string;
    roomToken = query.get("roomToken") as string;
  }

  if (!uuid || !roomToken) {
    const rooms = JSON.parse(persistStore.getItem("rooms") || "[]");
    ({ uuid, roomToken } = rooms[0]);
  }

  if (!uuid || !roomToken) {
    const shouldCreateRoom = window.confirm(
      "Not found uuid/roomToken both in query and localStorage, create a new one?"
    );
    if (shouldCreateRoom) {
      ({ uuid, roomToken } = await createRoom());
      location.reload();
    }
  }

  if (!uuid || !roomToken) {
    return undefined;
  }

  return { uuid, roomToken };
}

export async function joinRoom(info: RoomInfo): Promise<Room> {
  const room = await sdk.joinRoom({
    ...info,
    invisiblePlugins: [WindowManager],
    useMultiViews: true,
    disableNewPencil: false,
    floatBar: true,
    userPayload: {
      cursorName: faker.name.firstName(),
    },
  });
  window.room = room;
  clearQueryString();
  return room;
}

export async function reset({
  manager = window.manager,
  room = window.room,
  clearScreen = false,
  reload = false,
} = {}): Promise<void> {
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
  // clear screen
  if (clearScreen) {
    room.cleanCurrentScene();
  }
  // reload page
  if (reload) {
    location.reload();
  }
}

export function init(container: HTMLElement): void {
  room.setScenePath("/init");
  WindowManager.mount({ room, container, chessboard: false });
  window.manager = room.getInvisiblePlugin(WindowManager.kind) as WindowManager;
  manager.switchMainViewToWriter();
}

export const tools = Object.values(ApplianceNames);
