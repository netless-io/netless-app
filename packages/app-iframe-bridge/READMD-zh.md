### 接入指南

Iframe Bridge 为任意静态网页提供了同步的能力，其核心是两个功能：

- 全局状态 Attributes，为任意可以 JSON 序列化的对象
- 广播事件 Magix，可以发送一个事件通知给所有人

应用在 iframe 内通过 postMessage 与核心进行交互，一个最简单的例子如下：

```js
window.addEventListener("message", e => {
  const { kind, payload } = e.data;
  // Attributes
  if (kind === "Init") {
    console.log("初始状态", payload.attributes);
  }
  if (kind === "AttributesUpdate") {
    console.log("状态改变", payload.attributes);
  }
  // Magix
  if (kind === "ReceiveMagixEvent") {
    // payload.event 事件类型
    // payload.payload 事件内容
    console.log("收到事件", payload.event, payload.payload);
  }
});

button.addEventListener("click", () => {
  // Attributes
  // 更新状态
  postMessage({
    kind: "SetAttributes",
    payload: { count: 1 },
  });
  // Magix
  // 发送事件
  postMessage({
    kind: "DispatchMagixEvent",
    payload: {
      event: "custom event type",
      payload: "event message",
    },
  });
});

// 注册要监听的事件类型，只有这里注册了的事件类型才能接收到
postMessage({
  kind: "RegisterMagixEvent",
  payload: "custom event type",
});
```

例如，要制作一个类似 PPT 的应用，可以想象他存在一个「页码」状态，我们可以用一个数字来保存他，假设他叫 `page`：

```js
let page = 1; // 默认值

window.addEventListener("message", e => {
  const { kind, payload } = e.data;
  // 收到初始化事件或者更改了状态
  if (kind === "Init" || kind === "AttributesUpdate") {
    page = payload.attributes?.page;
    refreshPage();
  }
});

button.addEventListener("click", () => {
  // 点击「下一页」时更新 page
  postMessage({
    kind: "SetAttributes",
    payload: { page: page + 1 },
  });
});
```

假设该网页已发布到 https://example.org, 那么在 `addApp` 时传参如下：

```js
manager.addApp({
  kind: "IframeBridge",
  attributes: {
    src: "https://example.org",
    state: {}, // 其他初始值
  },
});
```
