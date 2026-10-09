# 真实多人验收

使用 `pnpm --filter @netless/app-slide build` 的实际产物和 registry Slide alpha。
白板 1.5 使用 `@netless/appliance-plugin@1.1.38` 实际发布包。

将测试配置放在仓库外，文件仅对本人可读：

```json
{
  "appIdentifier": "测试 App 标识",
  "region": "cn-hz",
  "rooms": {
    "1.0": { "uuid": "空测试房间", "roomToken": "测试房间 Token" },
    "1.5": { "uuid": "另一个空测试房间", "roomToken": "测试房间 Token" }
  }
}
```

也可用 `sdkToken` 替代 `rooms`，服务启动时会创建两个不录制的房间及有效期两小时的
roomToken。配置和 Token 不写入日志、页面 URL 或仓库。

```sh
APP_SLIDE_E2E_CONFIG=/absolute/path/outside/repo/test-config.json \
  pnpm --filter @netless/app-slide test:browser
```

分别为 mode=1.0 和 mode=1.5 打开四个页面，role 使用 writer-a、writer-b、reader-1、
reader-2。例如：`http://127.0.0.1:5188/?mode=1.0&role=writer-b`。
writer-a 自动创建一个唯一路径的测试 PPT。writer-b 的 JSON 加载延迟 1500ms。
准备完成后点击 writer-a 的连续翻页按钮；也可让 writer-b 发起翻页，检查作者切换。
等四端收敛后，逐端冻结恢复，并关闭和
重新打开一个接收端。fixture 默认是既有的媒体样本，也可通过 taskId/prefix
指定其他真实转换产物。本轮实际 fixture 为 16 页。

观察页面、SDK Canvas 和 events.jsonl：

- 当 writer-a 发起翻页时，writer-b、reader-1/2 不回写 shared-scene/shared-state；
  换 writer-b 发起后，共享写入应随事件作者变化。只读端始终不写入。
- 两种白板环境都由当前发起者更新 shared-scene、共享 fullPath 和 storagePage；
  接收端加载期间标注层与 PPT 暂时不同步属于当前已接受的限制。
- 1.5 不再调用本地切页接口。所有端收敛后，pluginScene、原生 View、fullPath 和
  page 一致；自动重连新 View 后仍应一致。同时观察笔迹/文字层像素，不能只看状态字段。
- dispatch.clientId 等于该端 joinRoom uid；origin.authorId 对应事件作者的 observerId。
- 动画、媒体和冻结/恢复后没有过时的共享状态回写；新加入端恢复最新状态。

页面提供冻结恢复、断开按钮和 `window.__syncOriginTest`，方便浏览器自动化调用。
另有单页跳转、下一步动画和页码文字标注按钮，用于检查真实标注层像素。
使用 WindowManager 文档要求的 `useMobXState: true`。首屏通过 Slide 的原始 emit
转发进行观测，不修改事件 payload。关闭 HMR，修改页面代码后需主动 reload，
避免自动刷新打断 App 首次创建。
服务只监听 localhost。验收完成后四端断开并停止服务。没有测试配置时，配置端点返回
503，不会自动使用 playground 的已有房间。

`pnpm --filter @netless/app-slide test:browser:build` 仅编译验收页面；通过不代表房间验收通过。

2026-10-09 的共享 scene/重入验收及 2026-10-08 的历史八端摘要见 [ACCEPTANCE.md](ACCEPTANCE.md)。
