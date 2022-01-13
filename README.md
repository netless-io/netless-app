# Netless App

Official Apps for the Agora Interactive Whiteboard.

## Installation:

> If you don't have pnpm installed:
>
> ```bash
> npm i -g pnpm
> ```

Clone or fork this project, at project root run:

```bash
pnpm i
pnpm build-all
```

## Environment

By default the `playground` demo uses a shared [Agora Whiteboard](https://www.agora.io/en/products/interactive-whiteboard/) account.

We recommend you use your own. Please register a new account and create a new env file `packages/playground/.env.local`. See `packages/playground/.env.example` for reference.

## Development

```bash
pnpm dev
```

## Create A New App

```bash
pnpm create-app
```

## Useful Context APIs

### Replayable Synced Storages

Storage that synced across clients. Operations on storages are kept which can be replayed.

```js
// Create a storage under "counter" namespace with default value.
// You can create multiple storages under the same namespace.
// They will share the same synced storage.
const storage1 = context.createStorage("counter", { count: 1 });

// Access states
console.log(storage1.state.count); // 1

// Listen to state changes
const storage1StateListenerDisposer = storage1.addStateChangedListener(diff => {
  if (diff.count) {
    console.log(diff.count.newValue, diff.count.oldValue);
  }
});

const sea = {
  a: 1,
  b: false,
};

// Only writable user can setState
if (context.getIsWritable()) {
  // Similar to React setState, unchanged values will be filtered by a root-level shallow-compare.
  storage1.setState({
    count: 2,
    disabled: true,
    // Note that `setState` only performs root-level shallow-compare.
    // Object `sea` will be compared with `===`.
    // Keys of `sea` will not be compared!
    sea,
  });
}

// Remember to remove unused listener later
context.emitter.on("destroy", () => {
  storage1StateListenerDisposer();
});

// There is also a default `context.storage` which handles the `attributes`
// option from `WindowManager.addApp` config.
// This is useful if you want initial values from the client who creates the app.
context.storage.ensureState({ count: 0 });

console.log("Storage state", context.storage.state);

const stateListenerDisposer = context.storage.addStateChangedListener(diff => {
  if (diff.count) {
    console.log("Storage state changed", diff.count.newValue, diff.count.oldValue);
  }
});

if (context.getIsWritable()) {
  context.storage.setState({ count: 12 });
}

context.emitter.on("destroy", () => {
  stateListenerDisposer();
});
```

### Replayable Client Messaging

Messaging between clients. Note that client will also receive the message sent by itself.

```js
const magixListenerDisposer = context.addMagixEventListener("ping", message => {
  console.log("Received Message", message);
});

if (context.getIsWritable()) {
  context.dispatchMagixEvent("ping", 22);
}

context.emitter.on("destroy", () => {
  magixListenerDisposer();
});
```

## License

The MIT license.
