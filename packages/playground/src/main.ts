import "@netless/window-manager/dist/style.css";
import type { WindowManager } from "@netless/window-manager";
import type { Room } from "white-web-sdk";

import type { AppGroup } from "./apps";
import App from "./app.svelte";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).app = new App({ target: document.querySelector("#app") as HTMLElement });

declare global {
  // eslint-disable-next-line no-var
  var room: Room;
  // eslint-disable-next-line no-var
  var manager: WindowManager;
  // eslint-disable-next-line no-var
  var apps: AppGroup[];
}

// remove all service workers
// prettier-ignore
navigator.serviceWorker?.getRegistrations().then(registrations => {
  for (const registration of registrations) {
    registration.unregister();
  }
}).catch(() => {
  // ignore any error
});
