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
    originSize: manager.mainView.size, // [4]
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
      { pageIndex: 1, shapeId: "slide-19", link: "https://www.aaa.com" },
      { pageIndex: 1, shapeId: "slide-22", link: "https://www.bbb.com" },
    ],
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

4. (可选) `originSize`

   用于匹配课件笔记的固定白板分辨率。添加 app 时传入主白板尺寸；传入 `null` 时使用 PPT 自身分辨率。

5. (可选) `navigationButtonMode`

   底部左右按钮的导航模式，默认值为 `"page"`。

   ```ts
   appOptions: {
     navigationButtonMode: "page", // 上一页/下一页
     // navigationButtonMode: "step", // 上一步/下一步
   }
   ```

### 更新日志

#### 0.2.107（2026-10-09）

- 升级 PPT 引擎至 `@netless/slide@1.4.63`。
- 翻页产生的共享白板场景和 PPT 状态仅由发起操作的可写客户端同步，避免接收端重复回写。
- 白板 1.0/1.5 统一使用共享场景路径，修复重连后白板场景被重置而与 PPT 页码不一致的问题。
- 启动和重入时持续接收 storage 状态更新，收到首个同步事件后交接到信令，减少漏信令造成的旧页恢复。
- 冻结、解冻和状态恢复串行执行，等待完整恢复后再转交缓存信令，支持恢复失败后的重试。
- 将白板 uid（suid）传入 Slide 的 clientId，便于日志定位。

### 协议

MIT @ [netless](https://github.com/netless-io)
