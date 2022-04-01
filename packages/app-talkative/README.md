## @netless/app-talkative

Netless App for playing and syncing Talk Cloud compatible HTML5 courseware.

### Install

```
npm add @netless/app-talkative
```

### Usage

Register this app to `WindowManager` before use:

```ts
import Talkative from "@netless/app-talkative";

WindowManager.register({
  kind: "Talkative",
  src: Talkative,
});
```

Insert HTML5 courseware into the room:

```js
manager.addApp({
  kind: "Talkative",
  options: {
    title: "Custom Title",
  },
  attributes: {
    src: "https://url/to/talkative/app",
    uid: "operator's uid", // optional
  },
});
```

### Notes

Only one user could control the app (navigate pages, click stuff in it).

If `uid` is not provided, this app will automatically make the one who
called the `addApp()` as operator.

### License

MIT @ [netless](https://github.com/netless-io)
