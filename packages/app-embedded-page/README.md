## @netless/app-embedded-page

Netless App for embedding web apps, providing the ability to sync state and event messaging.

### Usage

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

### Licence

MIT @ [netless](https://github.com/netless-io)
