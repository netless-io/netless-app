## @netless/app-slide

WebGL 版 PPT 展示插件。

### 用法

```ts
import AppSlide, { addHooks } from "@netless/app-slide";

// 1. 在加入房间前注册此 app
WindowManager.register({
  kind: "Slide",
  src: AppSlide,
  addHooks, // 启用自动冻结功能，优化 CPU 和内存占用
});

// 2. 加入房间后，这样插入 PPT
manager.addApp({
  kind: "Slide",
  options: {
    scenePath: `/ppt/${uuid}`, // [1]
    title: "a.pptx",
  },
  attributes: {
    taskId: "1234567...", // [2]
    url: "https://convertcdn.netless.link/dynamicConvert", // [3]
  },
});
```

参数：

1. (**必须**) `scenePath`

   全局唯一路径，建议为 `"/ppt/" + taskId`。

2. (**必须**) `taskId`

   [PPT 转换](https://developer.netless.link/server-en/home/server-conversion) 任务 ID。

3. (可选) `url`

   PPT 转码后资源存储服务器链接前缀，默认为 `https://convertcdn.netless.link/dynamicConvert`。

### 本地预览

```ts
import { previewSlide } from "@netless/app-slide";

const previewer = previewSlide({
  container: document.getElementById("preview"),
  taskId: "1234567...",
});

previewer.destroy();
```

### 协议

MIT @ [netless](https://github.com/netless-io)
