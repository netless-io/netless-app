## @netless/app-slide

Netless App for viewing animated slides, in our new engine.

[中文](./README-zh.md)

### Usage

```ts
import AppSlide, { addHooks } from "@netless/app-slide";

// 1. register before joining room
WindowManager.register({
  kind: "Slide",
  src: AppSlide,
  addHooks, // enables auto-freeze
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
  },
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
