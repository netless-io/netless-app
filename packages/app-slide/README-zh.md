## @netless/app-slide

WebGL 版 PPT 展示插件。

### 用法

```ts
import type { Attributes as SlideAttributes } from "@netless/app-slide";

// 1. 在加入房间前注册此 app
WindowManager.register({
  kind: "Slide",
  appOptions: {
    // 打开这个选项显示 debug 工具栏
    debug: false,
  },
  src: async () => {
    const app = await import("@netless/app-slide");
    return app.default ?? app;
  },
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
  } as SlideAttributes,
});
```

参数：

1. (**必须**) `scenePath`

   全局唯一路径，建议为 `"/ppt/" + taskId`。

2. (**必须**) `taskId`

   [PPT 转换](https://developer.netless.link/server-en/home/server-conversion) 任务 ID。

3. (可选) `url`

   PPT 转码后资源存储服务器链接前缀，默认为 `https://convertcdn.netless.link/dynamicConvert`。

### 协议

MIT @ [netless](https://github.com/netless-io)
