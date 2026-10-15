# app-slide 完整媒体与生命周期 E2E

使用实际 npm Slide 依赖和 app-slide 的 ESM/IIFE 构建，通过真实 WindowManager、White SDK 与 Appliance 插件创建独立、不录制的测试房间。测试不替换播放器。

覆盖矩阵：白板 1.0/1.5 × HTML5Audio/WebAudio × 快可写端/400ms 慢可写端/只读端。覆盖视频、纯音频、播放/暂停、重复暂停、播放中定位、快速取消播放、冻结/重复解冻、恢复中再次冻结、真实连接中断、作者切换、旧脚本注册地址下重入、客户整稿翻页与动画步骤。

先执行 app-slide 单测、根目录 runtime-lifecycle 与构建，再执行：

    APP_SLIDE_E2E_CONFIG=/absolute/private/config.json APP_SLIDE_E2E_OUTPUT=/absolute/output node packages/app-slide/test/browser-media-e2e/run.mjs

app-slide 的 `prepublishOnly` 会依次执行单测、生命周期测试、正式构建和这套完整 E2E。每次发布必须提供私有配置和可用浏览器；凭据或验收资源缺失会阻止发布。

配置位于仓库外，权限 0600，包含专用测试 sdkToken、appIdentifier、region、已下载旧版本脚本的 oldIifePath，以及 customerResource: {taskId,prefix,pageCount} 和 animationResource: {taskId,prefix,page}。缺少两类资源会记录 notRun 并使完整验收失败。不得配置或修改客户真实房间。

运行环境需安装 Playwright 与 Chrome；可通过 APP_SLIDE_PLAYWRIGHT 指定本机 Playwright 模块路径、SLIDE_CHROMIUM_EXECUTABLE 指定 Chrome。HTML5 是当前 Slide 的默认实际后端，WebAudio 通过透传 appOptions.enableWebAudio=false 配置。测试每次核对实际后端。

暂停验收检查 App storage 和 Slide 状态、原生音视频的 paused 标记、WebAudio BufferSource，以及连续采样的时间停止推进。播放验收要求实际音频和视频时间推进，不能仅靠 play 状态通过。

客户整稿检查逐页完成渲染和三端页码收敛；客户媒体验收使用首页原始视频，另用合成视频/纯音频覆盖完整操作矩阵。动画验收使用含剩余点击步骤的页面，检查引擎及 storage 步骤同步；不代表所有动画内媒体均已验收。快速播放后暂停专门覆盖尚未完成起播的取消路径，其余播放场景必须验证时间推进。旧注册地址重入后会再次验证视频和纯音频播放/暂停及实际后端。

未处理异常、资源 HTTP/传输失败和非预期 console error 均使验收失败。白名单仅包括当前 SDK 的日志 Worker 降级、主动断线错误、切页/销毁的 ERR_ABORTED，以及已有独立 HTTP/传输门禁覆盖的浏览器资源错误消息。

失败同样精确停用本次创建的房间并回读确认 isBan=true、isRecord=false。结果不记录 SDK/Room Token。合成 MP4/MP3 fixture 来自 Slide 的本地 ffmpeg 测试图与正弦音，不含客户内容。

桌面浏览器 E2E 不替代移动设备、录制回放与 RTC/PCM 的独立验收。
