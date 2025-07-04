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
    urlInterrupter: async (url: string) => {
      // 一般会有不同的实现，比如签名。
      const { ak, expire } = await getSTSToken(); // 客户的客户端实现。
      return `${url}?expire=${expire}&ak=${ak}`;
    },
    // 更多选项可以在 https://github.com/netless-io/netless-slide-demo#slide-%E9%85%8D%E7%BD%AE 查看
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
    previewList: [
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/preview/1.png",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/preview/2.png",
    ],
    resourceList: [
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/slide-1.json",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/slide-2.json",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/slide-3.json",
    ],
    customLinks: [
      { pageIndex: 1, shapeId: 'slide-19', link: 'https://www.aaa.com'},
      { pageIndex: 1, shapeId: 'slide-22', link: 'https://www.bbb.com'}
    ]
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
