## @netless/app-embedded-page

Netless App for embedding web apps, providing them the ability to sync state.

### Usage

1. Create a web app, publish it to some url.
2. Send & receive messages from parent window, see [types.ts](./src/types.ts):
3. Call `addApp` to add it to whiteboard.

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
