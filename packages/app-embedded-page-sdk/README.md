## @netless/app-embedded-page-sdk

SDK for storing shared replayable states and sending/receiving replayable events inside [@netless/app-embedded-page](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page).

### Install

```bash
npm add @netless/app-embedded-page-sdk
```

### Usage

```ts
import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";

interface State {
  count: number;
}

type Message = {
  type: "click";
  payload: { id: string };
};

const app = createEmbeddedApp<State, Message>({ count: 0 });

app.state; // => { count: 0 }
app.setState({ count: 2 });
app.onStateChanged.addListener(diff => {
  if (diff.count) {
    // count: 0 -> 2
    console.log("count:", diff.count.oldValue, "->", diff.count.newValue);
    console.log(diff.count.newValue === app.state.count);
  }
});

app.sendMessage({ type: "click", payload: { id: "item1" } });
app.onMessage.addListener(({ type, payload }) => {
  if (type === "click") {
    click(payload.id);
  }
});

app.destroy(); // remove all event listeners
```

### Details

1. Do not rely on the order of state changes:
   - `app.setState()` alters `app.state` synchronously but `onStateChanged` will wait until the data is successfully synced.
   - State syncing time span varies due to network status and data size. It is recommended to store only necessary data in the store.
2. `app.onMessage` won't receive `app.sendMessage()` messages sent by itself.

### Licence

MIT @ [netless](https://github.com/netless-io)
