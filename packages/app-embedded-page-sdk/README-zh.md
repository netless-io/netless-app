## @netless/app-embedded-page-sdk

用于实现在 [@netless/app-embedded-page](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page) 内创建同步状态和收发事件的应用的 SDK。

### 安装

```bash
npm add @netless/app-embedded-page-sdk
```

### API

- **createEmbeddedApp()**

  创建一个 Embedded App 实例。

  返回: `Promise<EmbeddedApp<State, Message>>`

  ```js
  const app = await createEmbeddedApp();
  ```

- **app.state**

  类型: `State`\
  默认值: `initialState`

  在所有客户端之间同步的状态，调用 `app.setState()` 来改变它。

- **app.page**

  类型: `string | undefined`

  当前白板的场景，只有在 `addApp` 时传入了 `scenePath` 才能使用。调用 `app.setPage()` 来切换白板页。

- **app.isWritable**

  类型: `boolean`

  当它是 `false` 时，调用 `app.setState()`、`app.setPage()`、`app.sendMessage()` 无效。

- **app.meta**

  类型: `{ sessionUID: number; uid: string; roomUUID?: string; userPayload: unknown }`

  一些房间元信息，包括

  - `sessionUID`: 当前会话唯一标识，刷新后就会改变
  - `uid`: 当前用户的唯一标识，由用户 `joinRoom()` 时传入
  - `roomUUID`: 当前房间的 UUID
  - `userPayload`: `joinRoom()` 时传入的同名对象

- **app.roomMembers**

  类型: `ReadonlyArray<{ sessionUID: number; uid: string; userPayload: unknown }>`

  房间内所有用户的信息，包括自己。

  - `sessionUID`: 当前会话唯一标识，刷新后就会改变
  - `uid`: 当前用户的唯一标识，由用户 `joinRoom()` 时传入
  - `userPayload`: `joinRoom()` 时传入的同名对象

- **app.ensureState(partialState)**

  确保 `app.state` 包含某些初始值，类似于执行了：

  ```js
  // 这段代码不能直接运行，因为 app.state 是只读的
  app.state = { ...partialState, ...app.state };
  ```

  **partialState**

  类型: `Partial<State>`

  ```js
  app.state; // { a: 1 }
  app.ensureState({ a: 0, b: 0 });
  app.state; // { a: 1, b: 0 }
  ```

- **app.setState(partialState)**

  和 React 的 `setState` 类似，更新 `app.state` 并同步到所有客户端。

  当设置某个字段为 `undefined` 时，它会被从 `app.state` 里删除。

  > **注意:** 不要依赖状态变化的顺序关系
  >
  > - `app.setState()` 会立刻改变本地的 `app.state`，但是 `onStateChanged` 会等数据同步才执行。
  > - 状态同步所需的时间和网络状态与数据大小有关，建议只在 state 里存储必须的数据。

  **partialState**

  类型: `Partial<State>`

  ```js
  app.state; //=> { count: 0, a: 1 }
  app.setState({ count: app.state.count + 1, b: 2 });
  app.state; //=> { count: 1, a: 1, b: 2 }
  ```

- **app.setPage(page)**

  切换上层白板的场景。

  **page**

  类型: `string`

  > **注意:** 这个参数不能包含 `/`

  ```js
  app.setPage("1");
  ```

- **app.sendMessage(message)**

  广播一条消息给其他客户端。

  **message**

  类型: 任何可以用 JSON 序列化的数据

  ```js
  app.sendMessage("hello, world!");
  ```

- **app.moveCamera(partialCameraState)**

  移动上层白板的视角。

  **partialCameraState**

  类型: `Partial<{ x: number, y: number, scale: number }>`

  默认的视角状态是 `{ x: 0, y: 0, scale: 1 }`，与页面正中间对齐。

  ```js
  app.moveCamera({ scale: 0.5 });
  ```

- **app.onStateChanged**

  当某一端调用 `app.setState()` 时执行（包括自己调用）。

  类型: `Emitter<{ [key: string]: { oldValue?, newValue? } }>`

  ```js
  app.onStateChanged.addListener(diff => {
    console.log("当前状态", app.state);
  });
  ```

- **app.onPageChanged**

  当某一端调用 `app.setPage()` 时执行（包括自己调用）。

  类型: `Emitter<{ oldValue?: string, newValue?: string }>`

  ```js
  app.onPageChanged.addListener(diff => {
    console.log("当前页面", app.page);
  });
  ```

- **app.onWritableChanged**

  当应用的可写权限更改时调用。

  类型: `Emitter<{ oldValue?: boolean, newValue?: boolean }>`

  ```js
  app.onWritableChanged.addListener(diff => {
    console.log("现在是否可写", app.isWritable);
  });
  ```

- **app.onRoomMembersChanged**

  当房间成员变化时调用。

  类型: `Emitter<{ oldValue?: RoomMember[], newValue?: RoomMember[] }>`

  ```ts
  interface RoomMember {
    sessionUID: number;
    uid: string;
    userPayload: unknown;
  }
  ```

  ```js
  app.onRoomMembersChanged.addListener(diff => {
    console.log("房间成员变化", app.roomMembers);
  });
  ```

- **app.onMessage**

  当收到其他客户端通过调用 `app.sendMessage()` 发送的消息时调用。

  > **注意:** 不会收到自己调 `app.sendMessage()` 发的消息

  类型: `Emitter<any>`

  ```js
  app.onMessage.addListener(message => {
    console.log("收到消息", message);
  });
  ```

### 示例代码

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

### License

MIT @ [netless](https://github.com/netless-io)
