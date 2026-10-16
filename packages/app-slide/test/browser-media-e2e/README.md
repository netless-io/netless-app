# app-slide 完整媒体与生命周期 E2E

使用实际 npm Slide 依赖和 app-slide 的 ESM/IIFE 构建，通过真实 WindowManager、White SDK 与 Appliance 插件创建独立、不录制的测试房间。测试不替换播放器。

覆盖矩阵：白板 1.0/1.5 × HTML5Audio/WebAudio × 快可写端/400ms 慢可写端/只读端。每个浏览器配置均执行完整矩阵：Chrome 允许自动播放、Chrome 阻止自动播放、WebKit。覆盖视频/纯音频、播放/暂停、定位、快速取消播放、冻结/释放、真实断线、作者切换、历史注册重入、裁剪/结束/重播、多个媒体、受控加载失败和重建恢复、客户整稿及动画步骤。

## frozen / release 的验收状态

底层 `Slide.frozen()` 销毁播放器，本地音视频静音；它是本地资源操作，共享状态不因此改成 pause。`Slide.release()` 默认恢复本地冻结时间线；app-slide 的 `unfreeze()` 会提供最新共享状态，并在恢复结束后再次核对最新 snapshot。

| 场景                      | 冻结时本地             | 共享及其他活动端     | app-slide 可写端恢复后               | app-slide 只读端恢复后       |
| ------------------------- | ---------------------- | -------------------- | ------------------------------------ | ---------------------------- |
| 播放中冻结                | 无播放器，原生节点停止 | play，其他端继续播放 | 跟随房间当前时间，禁止回写旧位置     | 跟随房间当前时间，零共享写入 |
| 暂停中冻结                | 静音                   | pause，位置保留      | 仍暂停在共享位置                     | 仍暂停在共享位置             |
| 冻结期间其他作者暂停/定位 | 静音                   | 最新 pause/位置      | 跟随新位置；释放期间不短暂播放旧快照 | 同左；不发布 play/pause/seek |
| 冻结期间共享媒体项被移除  | 静音                   | stop/空媒体状态      | 旧播放意图被取消                     | 旧播放意图被取消             |
| 冻结期间切页              | 静音                   | 最新页和媒体         | 恢复最新页和媒体，旧节点不得继续播放 | 同左                         |
| 所有客户端冻结            | 全部本地静音           | 共享 play 时间线继续 | 释放后按房间时间追赶                 | 同左                         |
| 自动播放被浏览器阻止      | 本地保持阻止状态       | 保留共享 play 意图   | 真实用户手势仅恢复本地               | 同左；零共享写入             |

可写权限不代表事件作者：接收侧可写端恢复时和只读端一样，不得回写状态、场景或发送新的播放/定位信令。测试同时观察 `frozen()` / `release()` 的实际调用、播放器存在性、旧 DOM 节点和 BufferSource、播放时间、共享状态及写入次数。

“冻结期间收到暂停后释放”用例先确认冻结端的 storage 已收到最新 pause，再释放播放器并检查没有短暂起播；网络中尚未送达的远端状态不作为该断言的前提。

冻结组合包括播放中断线、恢复中再次冻结、冻结后换页、音频响应延迟、其他作者暂停/停止、全部端同时冻结，以及原始客户视频。原生节点观察调用浏览器原方法，不替换播放器、原生播放 Promise 或解码器。测试忽略 Howler 解锁所用的空音频/data 音频，检查所有实际媒体节点，包含脱离 DOM 和已退役的节点。

先执行 app-slide 单测、根目录 runtime-lifecycle 与构建，再执行：

    APP_SLIDE_E2E_CONFIG=/absolute/private/config.json APP_SLIDE_E2E_OUTPUT=/absolute/output node packages/app-slide/test/browser-media-e2e/run.mjs

app-slide 的 `prepublishOnly` 会依次执行单测、生命周期测试、正式构建和 `test:media:release`。该门禁必须完成 Chrome 默认/禁止自动播放及 WebKit 三轮完整矩阵，核对同一制品哈希及每个必需场景。每次发布必须提供私有配置和浏览器；缺失即失败。诊断子集和 `SLIDE_CANDIDATE_DIR` 本地覆盖不允许满足发布门禁。

配置位于仓库外，权限 0600，包含专用测试 sdkToken、appIdentifier、region、已下载旧版本脚本的 oldIifePath，以及 customerResource: {taskId,prefix,pageCount} 和 animationResource: {taskId,prefix,page}。缺少两类资源会记录 notRun 并使完整验收失败。不得配置或修改客户真实房间。

运行环境需安装 Playwright 与 Chrome；可通过 APP_SLIDE_PLAYWRIGHT 指定本机 Playwright 模块路径、SLIDE_CHROMIUM_EXECUTABLE 指定 Chrome。HTML5 是当前 Slide 的默认实际后端，WebAudio 通过透传 appOptions.enableWebAudio=false 配置。测试每次核对实际后端。

暂停验收检查 App storage 和 Slide 状态、原生音视频的 paused 标记、WebAudio BufferSource，以及连续采样的时间停止推进。播放验收要求实际音频和视频时间推进，不能仅靠 play 状态通过。

客户整稿检查逐页完成渲染和三端页码收敛；客户媒体验收使用首页原始视频，另用合成视频/纯音频覆盖完整操作矩阵。动画验收使用含剩余点击步骤的页面，检查引擎及 storage 步骤同步；不代表所有动画内媒体均已验收。快速播放后暂停专门覆盖尚未完成起播的取消路径，其余播放场景必须验证时间推进。旧注册地址重入后会再次验证视频和纯音频播放/暂停及实际后端。

未处理异常、资源 HTTP/传输失败和非预期 console error 均使验收失败。白名单仅包括当前 SDK 的日志 Worker 降级、主动断线错误、切页/销毁的 ERR_ABORTED（WebKit 仅对 MP3/MP4 允许对应 cancelled）、以及已有独立 HTTP/传输门禁覆盖的浏览器资源错误消息。另允许 `Warning: render(...): Replacing React-rendered children with a new root component.`：已使用 npm app-slide 0.2.107 在同一白板 1.5 重连/重入路径独立复现，属于现有 WindowManager/Appliance React View 重挂载警告；其他 React 错误仍会阻止验收。

失败同样精确停用本次创建的房间并回读确认 isBan=true、isRecord=false。结果不记录 SDK/Room Token。合成 MP4/MP3 fixture 来自 Slide 的本地 ffmpeg 测试图与正弦音，不含客户内容。

桌面浏览器 E2E 不替代移动设备、录制回放与 RTC/PCM 的独立验收。

快速定位可设置 `APP_SLIDE_E2E_DIAGNOSTIC=boundaries`，只运行一组真实房间的边界场景，结果标为 diagnostic、matrixComplete=false，不算完整验收。浏览器选择使用 `APP_SLIDE_E2E_BROWSER=webkit`；`APP_SLIDE_E2E_AUTOPLAY=blocked` 开启实际 Chrome 自动播放限制。权限恢复必须由真实点击触发，并断言共享状态/写入次数/信令数不变。WebAudio 使用真实用户手势恢复原生 AudioContext，不宣称 HTML5 的 SDK 权限回调覆盖所有 WebAudio 设备。
