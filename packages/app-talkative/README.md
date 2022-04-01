## @netless/app-talkative

Netless App for playing and syncing talkative apps.

### Usage

```ts
// register this app
import Talkative from "@netless/app-talkative";
WindowManager.register({
  kind: "Talkative",
  src: Talkative,
});

// insert into room
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

If not provided `uid`, this app will automatically make the one who
called the `addApp()` as operator.

### License

MIT @ [netless](https://github.com/netless-io)
