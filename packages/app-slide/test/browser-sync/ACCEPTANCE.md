# Slide 与共享 scene 回归验收

## 正式 Slide 1.4.63：2026-10-09

app-slide 精确依赖 npm 正式包 `@netless/slide@1.4.63`，源码 gitHead 为
`b2a4f19db781bd76bbefc9f855faad0434233b16`。运行时及类型构建均使用安装包，
未使用 SLIDE_CANDIDATE_DIR。引擎文件与发布时编译产物逐字节一致。
White SDK 2.16.58、WindowManager 1.0.23、appliance-plugin 1.1.38。

两个新建、不录制的 CN-HZ 房间分别验证白板 1.0/1.5，各有快可写 A、慢可写 B、只读 R。
B 的 JSON loader 延迟 400ms；harness 保留原始 setSlideState 实现及参数，在完成后
额外等待 500ms，以延长恢复窗口。插件使用实际 OffscreenCanvas Worker。

| 场景                                        | 完成情况       |
| ------------------------------------------- | -------------- |
| 接收端冻结/恢复，含重复解冻与恢复中再次冻结 | 12/12          |
| B/R 自动重连，每端每种白板 2 次             | 8/8            |
| B/R 完整重入，从 storage 恢复最新页         | 4/4            |
| B 发起翻页后切回 A，验证写入归属            | 两种白板均通过 |

四个接收端各实际执行 3 次冻结恢复；各观察到 6 次引擎/app 状态恢复，最大并发为 1。
4 次再次冻结请求发生在恢复活动期间；缓存信令均在恢复结束后转交。
重连均重建 App proxy，新 View 的 PPT/storage/native/shared 路径收敛到第 3 页，
1.5 插件 View 也保持第 3 页。完整重入后再次检查了实际 PPT Canvas。

接收 A 翻页和恢复/重连期间 B/R 不回写共享 scene/state。由 B 发起时只有 B 写入；
切回 A 发起后只有 A 增加写入，R 全程写入为 0。动画/媒体状态可使同一页产生多次
stateChange，不要求一页只写一次状态。

120 条带来源的回调/信令保留客户端标识与整数 authorId；其中 108 条按当前显式
join 的 observerId 精确核对。自动重连会改变 observerId，另外 12 条不能用首次
join 值核对，只检查来源字段保留；写入归属另外通过实际 scene/state 调用验证。
初次 setup 的恢复开始早于插桩安装，其并发由 Controller 调度回归单独覆盖。

全量 app-slide 回归、runtime-lifecycle、ES/CJS/IIFE 与类型构建、测试页编译和发布包
dry-run 检查通过。app ESM SHA256 为
`25e51a705405463351bd0e754fd61edb1fcdbaeb42bac87aefa15cf0cbc85011`。
本轮制品、日志断言与截图保留在任务目录 `app-slide-slide-1.4.63-2026-10-09`。
未发布 app-slide 包；弱网/低端设备、全部媒体和旧录制未在本轮覆盖。
本轮测试端与服务已关闭，两个新房间已停用并独立回读，均未开启录制。

## 此前共享 scene 与重入验收（Slide alpha）：2026-10-09

当前策略统一使用 WindowManager 的 context.setScenePath，只有事件发起者且可写时
更新共享 scene/state；不再区分白板 1.0/1.5 的翻页路径。
运行依赖为 White SDK 2.16.58、WindowManager 1.0.23、appliance-plugin 1.1.38、
Slide 1.4.62-alpha.0。白板 1.5 使用实际 OffscreenCanvas Worker。

两个新建、不录制的 CN-HZ 房间分别验证 1.0/1.5，各有可写 A、可写 B、只读 R。
B 的公共 JSON loader 增加 400ms 延迟。使用同一 16 页真实 PPT。

- A 连续翻到 2、3，B/R 接收过程中没有共享 scene/state 回写；各端最终为 3。
- B 发起翻到 2，仅 B 增加共享 scene 调用；A/R 不回写。再由 A 翻到 3。
- 1.0/1.5 的 B/R 各自动重连 3 次，共 12 次全部恢复到第 3 页；
  PPT、storage、native View、共享 fullPath 一致，1.5 的新插件 View 也保持 3。
- 重连后由 A 翻到 2，两种环境各端均继续对齐。
- 每房间 A 的 shared scene 页码序列为 [1,2,3,3,2]（1 是初始化）；B 为 [2]。
  R 的共享 scene/state 写入均为 0。动画可增加 stateChange 次数，不要求每页仅一次 state 写入。

启动期补偿另有定向回归：首次恢复旧 snapshot 后仍监听 storage，串行保留最新状态；
收到第一条有效 Slide 信令后注销监听，恢复完成后按顺序转交缓存信令。
新增 BootstrapStorage 测试覆盖迟到的 snapshot、恢复中信令、错误重试、无状态和销毁。

常规全量测试、三格式构建与类型生成通过。翻页期间仍观察到短暂的 PPT/scene 不同
步，稳定后对齐；没有全局版本号/CAS。历史 fullPath/state 已经不一致的 App 不会由
接收端自动迁移，需要可写发起者切到另一页再切回。旧录制回放未在本轮验证。
真实笔迹逐像素、全部媒体、设备和 lazy setup 配置也不属于本轮新增验收。

测试页面、服务已关闭，房间已停用并独立回读。原始脱敏时序与分析断言保留在任务
制品 app-slide-shared-scenes-2026-10-09；不包含凭据。

## 历史来源同步验收：2026-10-08（原本地切页策略）

下面保留原策略的验收记录，其中 1.5 使用插件本地切页，与当前共享策略不同。

使用本地 app-slide `0.2.107-alpha.0` 构建，内含已发布 Slide `1.4.62-alpha.0`。
White SDK `2.16.57`、WindowManager `1.0.19`、appliance-plugin `1.1.38`。
启用 `useMobXState: true`；插件使用 `mainThread` 模式。未发布 app-slide 候选包。

在两间不录制的 CN-HZ 测试房间中，每种白板各启动快可写 A、慢可写 B、两个只读端。
B 的 JSON loader 延迟 1500ms，禁用 Slide 本地缓存。真实 CDN fixture
`18c7cd58ba674dc4aed6f0c620964589`，实际 16 页。

A 执行 `1→2→3→6→2→1`，B 最后完成时分别落后 A 11.482 秒（1.0）和
10.699 秒（1.5）。继续验证第 2 页标注、动画、冻结恢复、只读端重入，最后由 B 发起第 3 页。

| 白板 | A 共享切页  | B 共享切页          | 只读端共享切页 | A/B 共享状态 | 只读端共享状态 |
| ---- | ----------- | ------------------- | -------------- | ------------ | -------------- |
| 1.0  | 7           | 1，仅在成为发起者后 | 0 / 0          | 13 / 3       | 0 / 0          |
| 1.5  | 1，仅创建时 | 0                   | 0 / 0          | 13 / 3       | 0 / 0          |

- 每种有 29 次带来源的 renderEnd，clientId 匹配作者 joinRoom uid，authorId 匹配
  observerId；B 的 authorId 为 0。所有观测到的 syncDispatch 都带对应 clientId。
  每种另有 8 次本地启动/恢复 renderEnd 无来源，符合恢复语义。
- 八端最终 PPT/storage 均为第 3 页。1.0 SDK View 路径为 `/3`；1.5 插件本地路径
  为 `/3`，底层共享 SDK View 保持创建时的 `/1`。已有数字页在恢复、重入后仍为 `1..16`。
- 八端冻结恢复第 2 页时，共享切页和共享状态写入增量均为 0。两个只读端重入后
  恢复第 2 页，随后收到 B 的翻页并收敛至第 3 页。
- 通过真实 SDK/插件截图观察第 1/2 页红色页码标注的出现、切页后消失、冻结恢复
  后保留；1.5 慢端加载期间仍显示自己的旧 PPT 页及旧页标注。
- nextStep、mediaFullscreen 经真实同步链路，共享状态仅作者写入。
- 联调页修正包括必需的 MobX 配置、毫秒单位的两小时 roomToken、首屏事件观测和
  关闭 HMR。没有通过等待属性返回或修改业务事件来掩盖初始化问题。

未覆盖真实低端设备、背景 Worker、全部 mediaPlay/mediaPause/mediaSeek 操作，
以及双作者同时交错的压力场景。1.0 接收端加载期间 PPT 与标注层的短暂不同步仍是
已接受的限制；本变更不引入全局版本号/CAS。

浏览器 SDK 出现 foundation logger worker 不可用、回退 Argus 的错误级日志；
未发现 scene sync 失败。测试连接与服务已关闭，新建测试房间已停用并独立回读。
本摘要不包含凭据。原始脱敏事件、分析断言和截图观察记录保留在本地任务制品中。
