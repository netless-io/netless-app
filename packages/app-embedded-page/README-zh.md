## @netless/app-embedded-page

通过 iframe 与 SDK 为普通网页或 Web App 提供同步状态和广播事件的能力。

### 用法

#### ✏️ 基本用法

如果只希望利用白板多窗口插入一个普通的网页：

1. 创建一个网页或 Web App，确保它可以通过网络访问。
2. 调用 [WindowManager](https://github.com/netless-io/window-manager) 的 `addApp` 来添加到白板。

```js
manager.addApp({
  kind: "EmbeddedPage",
  attributes: {
    src: "<your-url>",
  },
});
```

#### ✏️ 状态与事件

如果想利用多窗口在多端同步状态以及事件通讯，请在自己的网页中使用 [`@netless/app-embedded-page-sdk`](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page-sdk)：

```js
import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";

const app = await createEmbeddedApp();

// 初始化值，只会在相应的 key 不存在 app.state 的时候设置值
app.ensureState({ count: 0 });

// 直接设值合并到 state，类似 React.setState
app.setState({ count: nextCount });

// 访问状态
console.log(app.state);

// 监听状态变化
app.onStateChanged.addListener(changedStates => {
  if (changedStates.count) {
    console.log(changedStates.count.newValue, changedStates.count.oldValue);
  }
});

// 向房间其他人广播消息
app.sendMessage({ type: "UPDATE_COUNT", uid: "222" });

// 监听其他人发来的消息
app.onPageChanged.addListener(message => {
  console.log(message);
});
```

如果需要你的用户在创建 app 时动态传入初始值，可以通过 `state` 设置：

```js
manager.addApp({
  kind: "EmbeddedPage",
  attributes: {
    src: "<your-url>",
    state: { initial: "state" }, // 必须是一个对象，默认是 {}
  },
});
```

#### ✏️ 白板绘制

如果你需要在页面上盖一个白板，在初始化时传入一个 `scenePath` 参数：

```js
manager.addApp({
  kind: "EmbeddedPage",
  options: {
    scenePath: "/demo", // `scenePath` 应该全局唯一（即便是不同 apps）。
  },
  attributes: {
    src: "<your-url>",
  },
});
```

> **注意:** 当白板绘制被启用时，你的页面会无法收到用户的鼠标事件。只有当白板教具 `room.state.memberState.currentApplianceName` 为 `clicker` 或者 `selector` 时才能透过白板点击到页面内。

#### ✏️ 多页白板

如果你的应用包含多个页面，并且想要给每个页面分别分配一块可以绘制的白板，可以使用 [SDK](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page-sdk) 的 Pages 接口。

```js
import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";

// 伪代码，用于你的网页每个页面的数据
const pages = [
  { content: "page 1", pageNum: "1" },
  { content: "page 2", pageNum: "2" },
  { content: "page 3", pageNum: "3" },
];

// 伪代码，渲染你的页面
const renderPage = pageNum => {
  const page = pages.find(e => e.pageNum === pageNum);
  $("#page-area").textContent = page.content;
};

const app = await createEmbeddedApp();

// 访问当前页
renderPage(app.page || pages[0].pageNum);

$("#btn-to-page-2").onclick = () => {
  // 切换到另一块白板页
  app.setPage("2");
};

// 监听页变化
app.onPageChanged.addListener(() => {
  renderPage(app.page || pages[0].pageNum);
});
```

### License

MIT @ [netless](https://github.com/netless-io)
