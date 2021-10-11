## @netless/app-embedded-page

为静态 Web App 提供同步状态和广播事件的能力。

### 用法

#### ✏️ 基本用法

1. 创建一个 Web App，确保他可以通过网络访问.
2. 调用窗口管理器的 `addApp` 来添加到白板.

```js
manager.addApp({
  kind: "EmbeddedPage",
  attributes: {
    src: "<your-url>",
  },
});
```

#### ✏️ 状态与事件

如果你需要同步状态和收发事件的能力，可以使用 [`@netless/app-embedded-page-sdk`](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page-sdk) 并在创建时传入初始状态：

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
    scenePath: "/demo",
  },
  attributes: {
    src: "<your-url>",
  },
});
```

> **注意:** 当白板绘制被启用时，你的页面会无法收到用户的鼠标事件。只有当教具为 `clicker` 或者 `selector` 时才能透过白板点击到页面内。

#### ✏️ 多页白板

如果你的应用包含多个页面，并且想要给每个页面分别分配一块可以绘制的白板，可以使用 [SDK](https://github.com/netless-io/netless-app/tree/master/packages/app-embedded-page-sdk) 的 Pages 接口。

```js
import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";

const pages = [
  { content: "page 1", pageNum: "1" },
  { content: "page 2", pageNum: "2" },
  { content: "page 3", pageNum: "3" },
];

const renderPage = pageNum => {
  const page = pages.find(e => e.pageNum === pageNum);
  $("#page-area").textContent = page.content;
};

// 创建一个 Embedded App 并等待初始化完成
const app = createEmbeddedApp();
app.onInit.addListener(() => {
  renderPage(app.page || pages[0].pageNum);
});

// 切换到另一块白板页
$("#btn-to-page-2").onclick = () => {
  app.setPage("2");
};

// 监听页变化
app.onPageChanged.addListener(() => {
  renderPage(app.page || pages[0].pageNum);
});
```

### Licence

MIT @ [netless](https://github.com/netless-io)
