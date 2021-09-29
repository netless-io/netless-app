## @netless/app-embedded-page-sdk

A simple wrapper for sending/receiving events with [@netless/app-embedded-page](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page).

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

1. `app.setState()` changes `app.state` immediately, while `onStateChanged` will wait until the data is sent to the whiteboard server.
2. `app.onMessage` won't receive messages sent by itself via `app.sendMessage()`.
3. Syncing time varies around 0.1s - 10s, don't expect it to be very fast.
4. Storing state needs bandwidth and time, don't store objects too big.

### Licence

MIT @ [netless](https://github.com/netless-io)
