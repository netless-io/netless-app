## @netless/app-embedded-page

Netless App for embedding web apps, providing the ability to sync state and event messaging.

### Usage

#### ✏️ Basic Usage

1. Create a web app/page, make it accessible through the web.
2. Call `addApp` to add it to whiteboard.

```js
manager.addApp({
  kind: "EmbeddedPage",
  attributes: {
    src: "<your-url>",
  },
});
```

#### ✏️ States and Events

If you need the ability to store shared replayable states and send/receive replayable events, use [`@netless/app-embedded-page-sdk`](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page-sdk) and set the initial state:

```js
manager.addApp({
  kind: "EmbeddedPage",
  attributes: {
    src: "<your-url>",
    state: { initial: "state" }, // must be an object, will be `{}` by default
  },
});
```

#### ✏️ Drawable Whiteboard

If you need whiteboard on top of your page, pass a `scenePath` option:

```js
manager.addApp({
  kind: "EmbeddedPage",
  options: {
    scenePath: "/demo",
  },
  attributes: {
    src: "<your-url>",
  },
});
```

> **Important:** When whiteboard drawing is enabled, the embedded page will not receive mouse events from user. Whiteboard drawing is disabled if and only if `room.state.memberState.currentApplianceName` is `clicker` or `selector`.

#### ✏️ Multi-page Whiteboard

If your app has multiple pages and want to have multiple whiteboards for each page independently, you can use pages APIs from [SDK](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page-sdk).

```js
import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";

const pages = [
  { content: "page 1", pageNum: "1" },
  { content: "page 2", pageNum: "2" },
  { content: "page 3", pageNum: "3" },
];

const renderPage = pageNum => {
  const page = pages.find(e => e.pageNum === pageNum);
  $("#page-area").textContent = page.content;
};

// Create an app and wait for its initialization
const app = createEmbeddedApp();
app.onInit.addListener(() => {
  renderPage(app.page || pages[0].pageNum);
});

// Switch to another page
$("#btn-to-page-2").onclick = () => {
  app.setPage("2");
};

// Listen page changed
app.onPageChanged.addListener(() => {
  renderPage(app.page || pages[0].pageNum);
});
```

### Licence

MIT @ [netless](https://github.com/netless-io)
