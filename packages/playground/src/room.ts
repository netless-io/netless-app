import { faker } from "@faker-js/faker";

import { WindowManager } from "@netless/window-manager";
import type { Room } from "white-web-sdk";
import { ApplianceNames, DeviceType, WhiteWebSdk } from "white-web-sdk";

import { QueryVersion, store, type RoomInfo } from "./common";
import { clearQueryString, createRoom, persistStore } from "./common";
import {
  ApplianceMultiPlugin,
  AppliancePluginOptions,
  UseWorkerType,
} from "@netless/appliance-plugin";
import fullWorkerString from "@netless/appliance-plugin/dist/fullWorker.js?raw";
import subWorkerString from "@netless/appliance-plugin/dist/subWorker.js?raw";

export const sdk = new WhiteWebSdk({
  appIdentifier: import.meta.env.VITE_APPID,
  useMobXState: true,
  deviceType: DeviceType.Surface,
});

export async function prepare(): Promise<RoomInfo | undefined> {
  let uuid: string | undefined;
  let roomToken: string | undefined;

  const query = new URLSearchParams(location.search);
  if (query.has("uuid") && query.has("roomToken")) {
    uuid = query.get("uuid") as string;
    roomToken = query.get("roomToken") as string;
  }

  if (query.has("shareable")) {
    [roomToken, uuid] = (query.get("shareable") as string).split(/[ +]/);
    if (roomToken && uuid) {
      roomToken = "NETLESSROOM_" + roomToken;
    }
  }

  if (!uuid || !roomToken) {
    const rooms = JSON.parse(persistStore.getItem("rooms") || "[]");
    if (rooms[0]) {
      ({ uuid, roomToken } = rooms[0]);
    }
  }

  if (!uuid || !roomToken) {
    uuid = import.meta.env.VITE_ROOM_UUID;
    roomToken = import.meta.env.VITE_ROOM_TOKEN;
  }

  if ((!uuid || !roomToken) && import.meta.env.VITE_TOKEN) {
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
  let uid = sessionStorage.getItem("uid");
  if (!uid) {
    uid = faker.datatype.uuid();
    sessionStorage.setItem("uid", uid);
  }
  const room = await sdk.joinRoom({
    ...info,
    uid,
    invisiblePlugins: [WindowManager as any, ApplianceMultiPlugin],
    useMultiViews: true,
    disableNewPencil: false,
    disableMagixEventDispatchLimit: true,
    floatBar: true,
    userPayload: {
      uid,
      nickName: faker.name.firstName(),
    },
  });
  window.room = room;
  if (QueryVersion !== 2) {
    clearQueryString();
  }
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

export async function init(container: HTMLElement) {
  const manager = await WindowManager.mount({
    room,
    container,
    chessboard: false,
    cursor: true,
    debug: true,
    prefersColorScheme: "auto",
    supportAppliancePlugin: true,
  })
  const fullWorkerBlob = new Blob([fullWorkerString], {
    type: "text/javascript",
  });
  const fullWorkerUrl = URL.createObjectURL(fullWorkerBlob);
  const subWorkerBlob = new Blob([subWorkerString], {
    type: "text/javascript",
  });
  const subWorkerUrl = URL.createObjectURL(subWorkerBlob);
  const pluginOptions: AppliancePluginOptions = {
    cdn: {
      fullWorkerUrl,
      subWorkerUrl,
    },
    extras: {
      useSimple: true,
      // useWorker,
      // canvasOpt: {
      //   contextType: "2d",
      // },
      cursor: {
        enable: false,
        expirationTime: 500,
        moveDelayTime: 300,
      },
      syncOpt: {
        interval: 100,
        smoothSync: false,
      },
      bezier: {
        enable: false,
        maxDrawCount: 180,
      },
      textEditor: {
        showFloatBar: false,
        canSelectorSwitch: false,
        rightBoundBreak: true,
        // extendFontFaces: [{fontFamily: "Pacifico", src: "https://fonts.gstatic.com/s/pacifico/v17/FwZY7-Qmy14u9lezJ-6H6MmBp0u-.woff2"}]
        extendFontFaces: [
          {
            fontFamily: "Noto Sans SC",
            src: "https://fonts.gstatic.com/s/opensans/v44/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-mu0SC55I.woff2",
          },
        ],
        loadFontFacesTimeout: 20000,
      },
      longDottedStroke: {
        lineCap: "round",
        segment: 2,
        gap: 3,
      },
    },
  };
  const plugin = await ApplianceMultiPlugin.getInstance(manager as any, {
    options: pluginOptions,
  });
  (window as any).appliancePlugin = plugin;
  window.manager = manager;
  await manager.switchMainViewToWriter();
  const tool = store.getItem("currentApplianceName") as ApplianceNames;
  if (tool) {
    manager.mainView.setMemberState({ currentApplianceName: tool });
  }
}

export const tools = Object.values(ApplianceNames);
