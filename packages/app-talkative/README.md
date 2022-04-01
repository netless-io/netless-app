## @netless/app-talkative

Netless App for playing and syncing talkative apps.

### Usage

```ts
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

If not provided `uid`, this app will automatically make the one who
called the `addApp()` as operator.

### License

MIT @ [netless](https://github.com/netless-io)
