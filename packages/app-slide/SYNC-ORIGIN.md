# Slide 同步来源接线

本分支精确依赖已发布的 `@netless/slide@1.4.63`，提供
`renderEnd(index, origin)` 和 `stateChange(state, origin)`，其中 origin
包含可选的 clientId 和 authorId。package.json 和 pnpm-lock.yaml 已同步更新。
构建入口会检查该能力，防止把旧引擎与新的写入规则打包到一起。
app-slide 候选版本为 `0.2.107-alpha.0`；用户要求本轮仅在本地测试，暂不发布。

## 行为

- `room.uid` 原样传给 Slide 的 clientId；这是 WhiteLogger 的 suid 来源。
  authorId 仍取 Magix envelope，覆盖 payload 同名字段，不使用 clientId 判断写权限。
- 创建 App 的可写客户端在首次有效 renderEnd 补齐数字页场景一次。如果数字页尚未
  创建，先移除 WindowManager 占位页，避免页码偏移。已存在的数字页及笔迹保留；
  后续翻页不会重建场景。仅实际创建场景时设置初始共享 scene path。
  初始化标记仅在数字页已齐全或 SDK 场景写入成功后设置；SDK 抛错时保持可重试，
  后续有效 renderEnd 会重新尝试初始化。
- 白板 1.0/1.5 统一使用 `context.setScenePath`。可写且
  `origin.authorId === room.observerId` 的客户端在 renderEnd
  调用共享 setScenePath。使用回调 index，不读取此时尚未更新的 currentSlideIndex。
- 两种白板的 storage.state 均只由当前可写的事件作者写入；无 origin 的恢复、
  无法判定归属的状态和远端事件不写共享状态。
- 主 UI 页码仍由 slideChange 更新；ready 和 slideChange 不再另行写共享 scene path。

接收端的 PPT 和标注层仍可能在加载期间短暂不同步。多端主动交错操作没有
引入全局版本号/CAS。本变更解决接收端因本地渲染完成而重复回写的问题。

## 启动与解冻恢复

启动时恢复 storage 快照。非创建端继续监听 storage，按内容去重、复制快照，串行恢复
且只保留最新待处理快照。首次有效 Slide 信令立即移除监听；已接受的恢复完成后按
FIFO 转交信令，保留 clientId 与传输 authorId。

冻结、解冻和快照恢复共享每个 Controller 的生命周期协调：

1. 冻结请求阻止开始新的快照恢复和信令转交，等待当前恢复结束后销毁 Player。
   ready 前的冻结只记录意图，不阻止首屏恢复。
2. 冻结/解冻期间缓存信令和仍由启动监听接受的最新快照。
3. 解冻等待 Slide 内部完整恢复。Player 创建完成仅释放全局 WebGL 队列，其他 App
   的资源操作可以继续；当前正式版使用独立完成回调，并保留旧 alpha 的 Promise 兼容。
4. Player 恢复后读取最新 storage，强制送入同一个快照队列，即使内容与上次相同。
   快照恢复完成后转交缓存信令；解冻不重新开启已经关闭的 storage 监听。
5. 重复 freeze/unfreeze 串行执行。release 或解冻后的快照恢复失败保持信令暂停，
   后续激活可重试。解冻中途失活也保留未完成恢复，重新激活后再恢复快照与信令。
   destroy 清理监听、快照和信令，并终止生命周期等待。

Slide 1.4.63 的 release 在已有 Player 时调用完成回调，内部恢复失败时调用 onError；
对应修复已随 netless-ppt-plugin PR #254 合入并发布。
快照与信令没有共同序号，历史 fullPath/state 不一致也没有自动迁移。

调度回归使用真实 Controller，替换渲染和传输边界，覆盖最大恢复并发为 1、最新快照、
两种 release 接口、重复解冻、再次冻结、失败重试、销毁和 FIFO 交接。
它不代表真实 Canvas/媒体验收。

## 发布包验证

在 netless-app 根目录安装锁定的 npm 包后执行：

```sh
pnpm install --frozen-lockfile
pnpm --filter @netless/app-slide test
pnpm --filter @netless/app-slide build
```

运行时打包与类型生成都使用已安装的 `1.4.63`。

## 本地候选包验证（后续 SDK 开发）

需要验证尚未发布的 SDK 改动时，先在 netless-ppt-plugin 的目标分支构建 ppt-player
和 slide，再在 netless-app 根目录运行：

```sh
pnpm --filter @netless/app-slide test
SLIDE_CANDIDATE_DIR=/absolute/path/to/netless-ppt-plugin/packages/slide \
  pnpm --filter @netless/app-slide build
```

SLIDE_CANDIDATE_DIR 同时作用于 Vite 运行时打包和类型生成。它不修改安装目录、
package.json 或锁文件，也不发布 npm 包。

新增回归使用真实 SlideController 和 SceneSync 接线，渲染引擎/白板传输以替身驱动，
覆盖快慢可写端、只读端、同 uid 不同 author、传输 author 覆盖、首次初始化、
恢复无来源、两种白板共享切页、异步排队与销毁。它不代表真实多人房间或
真实 appliance-plugin Canvas 的端到端验收。

基线已更新到 `origin/slide-0.2@8471fca`，保留 0.2.106 生命周期修复；销毁流程兼容
当前 Slide alpha 的 Promise 返回值和上游 callback 风格。真实多人验收页面和运行方式
见 [test/browser-sync/README.md](test/browser-sync/README.md)。其源码编译通过不代表
隔离房间与 Canvas 验收已经完成。

## 历史验收状态（2026-10-08，本地切页方案）

以下保留当时结果，不作为目前共享切页及冻结协调改动的验证结果。2026-10-09 的
共享场景与重连验收见 [test/browser-sync/ACCEPTANCE.md](test/browser-sync/ACCEPTANCE.md)。

- 全量 app-slide 测试通过，包含 12 个生命周期场景和新增的来源接线测试；
  根目录 13 个 runtime-lifecycle 回归通过。CI 同时执行 app-slide 测试及联调页构建。
- 使用 npm alpha 的 ES/CJS/IIFE 构建及类型生成通过；ESLint 无错误、格式检查通过。
- 真实多人验收页构建通过；浏览器确认能加载，并在无配置时明确提示隔离房间缺失。
- `npm pack` 已生成 `0.2.107-alpha.0` 候选包，测试页面不进入发布包。
- 已使用用户授权的本机测试凭据完成白板 1.0/1.5 四端房间验收：每种包含两个
  可写端及两个只读端，慢端 JSON 延迟 1500ms，连续切页中最终落后约 11 秒。
  接收端无共享回写，改由慢可写端发起事件后共享写入归属随之切换。
- 八端冻结恢复无共享写入增量；两个只读端重新加入后恢复第 2 页。实际观察了
  第 1/2 页页码标注的出现、消失和冻结恢复；1.5 插件本地路径与 PPT 页一致。
- 动画 nextStep 及 mediaFullscreen 来源经过真实传输；未覆盖所有 mediaPlay/
  mediaPause/mediaSeek 或交错双作者压力场景。浏览器 SDK 日志出现 foundation logger
  worker 不可用、回退 Argus 的错误级日志，没有发现 scene sync 失败。
- 详细结果及脱敏事件位于 conversion-agent 的
  `outputs/app-slide-origin-2026-10-08/`。仓库内摘要见
  [test/browser-sync/ACCEPTANCE.md](test/browser-sync/ACCEPTANCE.md)。测试入口修正随
  PR 提交，候选包尚未发布，PR 进入代码评审。
