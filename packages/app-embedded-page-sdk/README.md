## @netless/app-embedded-page-sdk

SDK for storing shared replayable states and sending/receiving replayable events inside [`@netless/app-embedded-page`](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page).

[中文](./README-zh.md)

### Install

```bash
npm add @netless/app-embedded-page-sdk
```

### Example

[More examples here](https://github.com/netless-io/netless-app/blob/master/packages/app-embedded-page).

```ts
import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";

interface State {
  count: number;
}

type Message = {
  type: "click";
  payload: { id: string };
};

const app = await createEmbeddedApp<State, Message>();

app.ensureState({ count: 0 });

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
```

### API

- **createEmbeddedApp()**

  Creates an embedded app instance.

  Returns: `Promise<EmbeddedApp<State, Message>>`

  ```js
  const app = await createEmbeddedApp();
  ```

- **app.appId**

  Type: `string`

  App ID. Each app is assigned with a unique ID on creation and will keep the same ID until destroyed.

- **app.state**

  Type: `State`\
  Default: `initialState`

  The synchronized state across all clients. To change it, call `app.setState()`.

- **app.page**

  Type: `string | undefined`

  Current whiteboard scene. It works only if `scenePath` has been set when calling `addApp`.
  To switch between pages, call `app.setPage()`

- **app.isWritable**

  Type: `boolean`

  When it is `false`, calling `app.setState()`, `app.setPage()`, `app.sendMessage()` has no effect.

- **app.meta**

  Type: `{ sessionUID: number; uid: string; roomUUID?: string; userPayload: unknown }`

  Room information, including

  - `sessionUID`: a unique number of current session. will change after refreshing.
  - `uid`: a unique id of current user passed in when calling `joinRoom()`.
  - `roomUUID`: current room's UUID.
  - `userPayload`: the object passed in when calling `joinRoom()`.

- **app.roomMembers**

  Type: `ReadonlyArray<{ sessionUID: number; uid: string; userPayload: unknown }>`

  All members in the room.

  - `sessionUID`: a unique number of current session. will change after refreshing.
  - `uid`: a unique id of current user passed in when calling `joinRoom()`.
  - `userPayload`: the object passed in when calling `joinRoom()`.

- **app.ensureState(partialState)**

  Make sure `app.state` has some initial values, work as if:

  ```js
  // this code won't work because app.state is readonly
  app.state = { ...partialState, ...app.state };
  ```

  **partialState**

  Type: `Partial<State>`

  ```js
  app.state; // { a: 1 }
  app.ensureState({ a: 0, b: 0 });
  app.state; // { a: 1, b: 0 }
  ```

- **app.setState(partialState)**

  Works like React's `setState`, it updates `app.state` and synchronize it to other clients.

  When some field's value is `undefined`, it will be removed from `app.state`.

  > **Important:** Do not rely on the order of state changes:
  >
  > - `app.setState()` alters `app.state` synchronously but `onStateChanged` will wait until the data is successfully synced.
  > - State syncing time span varies due to network status and data size. It is recommended to store only necessary data in the store.

  **partialState**

  Type: `Partial<State>`

  ```js
  app.state; //=> { count: 0, a: 1 }
  app.setState({ count: app.state.count + 1, a: undefined, b: 2 });
  app.state; //=> { count: 1, b: 2 }
  ```

- **app.setPage(page)**

  Change the whiteboard scene on top of your page.

  **page**

  Type: `string`

  > **Important:** This argument must not include `/`.

  ```js
  app.setPage("1");
  ```

- **app.sendMessage(message)**

  Broadcast a message to other clients.

  **message**

  Type: anything that can be serialized in JSON.

  ```js
  app.sendMessage("hello, world!");
  ```

- **app.moveCamera(partialCameraState)**

  Change the whiteboard scene's position on top of your page.

  **partialCameraState**

  Type: `Partial<{ x: number, y: number, scale: number }>`

  The default camera state is `{ x: 0, y: 0, scale: 1 }`, at the center of your page.

  ```js
  app.moveCamera({ scale: 0.5 });
  ```

- **app.onStateChanged**

  It fires after someone called `app.setState()` (including the app itself).

  Type: `Emitter<{ [key: string]: { oldValue?, newValue? } }>`

  ```js
  app.onStateChanged.addListener(diff => {
    console.log("state changed", app.state);
  });
  ```

- **app.onPageChanged**

  It fires after someone called `app.setPage()` (including the app itself).

  Type: `Emitter<{ oldValue?: string, newValue?: string }>`

  ```js
  app.onPageChanged.addListener(diff => {
    console.log("switch page to", app.page);
  });
  ```

- **app.onWritableChanged**

  It fires when app writable state changes.

  Type: `Emitter<{ oldValue?: boolean, newValue?: boolean }>`

  ```js
  app.onWritableChanged.addListener(diff => {
    console.log("my writable becomes", app.isWritable);
  });
  ```

- **app.onRoomMembersChanged**

  It fires when room members changes.

  Type: `Emitter<{ oldValue?: RoomMember[], newValue?: RoomMember[] }>`

  ```ts
  interface RoomMember {
    sessionUID: number;
    uid: string;
    userPayload: unknown;
  }
  ```

  ```js
  app.onRoomMembersChanged.addListener(diff => {
    console.log("room members changed", app.roomMembers);
  });
  ```

- **app.onMessage**

  It fires when receiving messages from other clients (when other clients called `app.sendMessage()`).

  > **Note:** Won't receive `app.sendMessage()` messages sent by itself.

  Type: `Emitter<any>`

  ```js
  app.onMessage.addListener(message => {
    console.log("received message", message);
  });
  ```

### License

MIT @ [netless](https://github.com/netless-io)
