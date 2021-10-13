## @netless/app-embedded-page

Netless App for embedding web apps, providing the ability to sync state and event messaging.

[中文](./README-zh.md)

### Usage

#### ✏️ Basic Usage

If you only want to insert a normal webpage into Whiteboard:

1. Create a web app/page, make it accessible through the web.
2. Call `addApp` from [WindowManager](https://github.com/netless-io/window-manager) to add it to whiteboard.

```js
manager.addApp({
  kind: "EmbeddedPage",
  attributes: {
    src: "<your-url>",
  },
});
```

#### ✏️ States and Events

If you need the ability to store shared replayable states and send/receive replayable events, use [`@netless/app-embedded-page-sdk`](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page-sdk):

```js
import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";

const app = await createEmbeddedApp();

// Initialize state. Only set value the key does not exist in `app.state`
app.ensureState({ count: 0 });

// Set partial state to `app.state` like `React.setState`
app.setState({ count: nextCount });

// Access states
console.log(app.state);

// Listen to state changes
app.onStateChanged.addListener(changedStates => {
  if (changedStates.count) {
    console.log(changedStates.count.newValue, changedStates.count.oldValue);
  }
});

// Broadcast messages to other clients in the room
app.sendMessage({ type: "UPDATE_COUNT", uid: "222" });

// Listen to messages from other clients
app.onPageChanged.addListener(message => {
  console.log(message);
});
```

If you need to let your user pass initial values dynamically when creating the app, they may set the `state` attribute.

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
    scenePath: "/demo", // `scenePath` should be globally unique (across apps).
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

// Fake code for your page meta data
const pages = [
  { content: "page 1", pageNum: "1" },
  { content: "page 2", pageNum: "2" },
  { content: "page 3", pageNum: "3" },
];

// Fake code for rendering your page
const renderPage = pageNum => {
  const page = pages.find(e => e.pageNum === pageNum);
  $("#page-area").textContent = page.content;
};

const app = await createEmbeddedApp();

// Access page meta
renderPage(app.page || pages[0].pageNum);

$("#btn-to-page-2").onclick = () => {
  // Switch to another page
  app.setPage("2");
};

// Listen to page changes
app.onPageChanged.addListener(() => {
  renderPage(app.page || pages[0].pageNum);
});
```

### Licence

MIT @ [netless](https://github.com/netless-io)
