## @netless/app-slide

Netless App for viewing animated slides, in our new engine.

[中文](./README-zh.md)

### Usage

```ts
import type { Attributes as SlideAttributes } from "@netless/app-slide";

// 1. register before joining room
WindowManager.register({
  kind: "Slide",
  appOptions: {
    // turn on to show debug controller
    debug: false,
    urlInterrupter: async (url: string) => {
      // There will be different implementations depending on different cloud storage services.
      // Generally, signatures are added to the query parameters.
      const { ak, expire } = await getSTSToken(); // Customer service side implementation.
      return `${url}?expire=${expire}&ak=${ak}`;
      // https://github.com/netless-io/netless-slide-demo#slide-%E9%85%8D%E7%BD%AE for more options
    },
  },
  src: async () => {
    const app = await import("@netless/app-slide");
    return app.default ?? app;
  },
});

// 2. when joined room, add ppt to whiteboard
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
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/preview/3.png",
    ],
    resourceList: [
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/note.json",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/overview.json",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/sheet-1-0-color.json",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/sheet-1-0-color.png",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/sheet-2-0-color.json",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/sheet-2-0-color.png",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/sheet-3-0-color.json",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/sheet-3-0-color.png",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/slide-1.json",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/slide-2.json",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/slide-3.json",
      "https://convertcdn.netless.group/test/dynamicConvert/8ed5cce449874494a9ca7894b39415fb/jsonOutput/title.json",
    ],
    customLinks: [
      { pageIndex: 1, shapeId: 'slide-19', link: 'https://www.aaa.com'},
      { pageIndex: 1, shapeId: 'slide-22', link: 'https://www.bbb.com'}
    ]
  } as SlideAttributes,
});
```

Parameters:

1. (**required**) `scenePath`

   Which scene to be put on top of slides.

2. (**required**) `taskId`

   The [PPT conversion](https://developer.netless.link/server-en/home/server-conversion) task id.

3. (optional) `url`

   The base url of ppt resources, `https://convertcdn.netless.link/dynamicConvert` by default.

### Preview

```ts
import { previewSlide } from "@netless/app-slide";

const previewer = previewSlide({
  container: document.getElementById("preview"),
  taskId: "1234567...",
});

previewer.destroy();
```

### License

MIT @ [netless](https://github.com/netless-io)
