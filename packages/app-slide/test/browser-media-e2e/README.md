# app-slide 完整媒体与生命周期 E2E

## WB-482 共享音量专项

安装 package.json 固定的实际 npm Slide 后，设置仓库外的 `APP_SLIDE_E2E_CONFIG`，在 app-slide 目录执行 `npm run test:volume:matrix`。输出目录可由 `APP_SLIDE_VOLUME_OUTPUT` 指定。矩阵将原十二组配置分别以功能开启、显式关闭执行（24 组），另补 Chromium/HTML5 与 WebKit/WebAudio 的未传开关默认关闭场景，共 26 组。每组创建独立、不录制的房间并在结束后禁用，报告核对同一 Slide/app 构建哈希；不接受 `SLIDE_CANDIDATE_DIR` 替代实际 npm 包。

开启专项还固定复现旧快照迟到顺序并验证权威字段保持、刷新和冻结恢复；关闭专项检查 DOM 中没有音量控件、共享 API/旧信令不生效、本地 API 与原播放控件正常、旧房间读取且不自动写入新字段。单配置可设置 `APP_SLIDE_E2E_VOLUME_MODE=enabled|disabled|default`。

专项验证默认 0.5、绝对共享音量 0/0.25/0.5/1、只读写入拦截、本地旧 API 与后续共享调整、连续拖动最终值、播放中调整及静音不暂停、视频和音频控制条真实指针操作、只读悬停仍隐藏控件、无媒体页/延迟渲染、冻结恢复、晚加入/刷新、断网重连、写权限移交、多可写端收敛，以及同一转换资源的两个 PPT 实例互不影响。

可以将测试机器的系统输出静音以避免测试音干扰。测试仍读取播放器/原生增益、共享 storage 和播放时钟；系统静音不覆盖扬声器或人耳听感验收。此专项不替代既有完整媒体发布门禁。

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

“冻结期间收到暂停/停止后释放”用例先确认冻结端的 storage 已收到最新 pause 或媒体项删除，再释放播放器并检查没有短暂起播；网络中尚未送达的远端状态不作为该断言的前提。

冻结期间积压的媒体消息通过 Slide 的本地 `receiveSyncEvents` 恢复批次交付：保留逐条接收/确认，只合并连续完整媒体状态中已被后续状态取代的执行，避免恢复最新 pause 后又回放旧 seek(play)。普通实时消息仍按原 FIFO 交付，切页、资源、顺序编号和同步重入边界保留。旧 Slide 没有该 API 时走兼容路径；该兼容路径不代表包含此次修复。

新批次 API 在监听器抛错后仍交付剩余事件，再向调用方上抛错误；app 记录错误，不重复交付已经接收的整批消息。永久销毁会取消剩余任务，普通 frozen/release 不销毁 Slide 实例。

冻结组合包括播放中断线、恢复中再次冻结、冻结后换页、音频响应延迟、其他作者暂停/停止、全部端同时冻结，以及原始客户视频。原生节点观察调用浏览器原方法，不替换播放器、原生播放 Promise 或解码器。测试忽略 Howler 解锁所用的空音频/data 音频，检查所有实际媒体节点，包含脱离 DOM 和已退役的节点。

先执行 app-slide 单测、根目录 runtime-lifecycle 与构建，再执行：

    APP_SLIDE_E2E_CONFIG=/absolute/private/config.json APP_SLIDE_E2E_OUTPUT=/absolute/output node packages/app-slide/test/browser-media-e2e/run.mjs

app-slide 的 `prepublishOnly` 会依次执行单测、生命周期测试、正式构建和 `test:media:release`。该门禁必须完成 Chrome 默认/禁止自动播放及 WebKit 三轮完整矩阵，核对同一制品哈希及每个必需场景。每次发布必须提供私有配置和浏览器；缺失即失败。诊断子集和 `SLIDE_CANDIDATE_DIR` 本地覆盖不允许满足发布门禁。

每个 E2E profile 都先按当前依赖和候选配置重新构建 app，再计算制品哈希并启动浏览器；独立执行 `test:media:release` 也走这条路径。npm 模式还校验实际安装版本与 app 的精确依赖一致。这样不会把之前候选构建遗留的 dist 误标成已安装的 npm 包。版本不一致或构建失败即停止，不创建测试房间。

配置位于仓库外，权限 0600，包含专用测试 sdkToken、appIdentifier、region、已下载旧版本脚本的 oldIifePath，以及 customerResource: {taskId,prefix,pageCount} 和 animationResource: {taskId,prefix,page}。缺少两类资源会记录 notRun 并使完整验收失败。不得配置或修改客户真实房间。

运行环境需安装 Playwright 与 Chrome；可通过 APP_SLIDE_PLAYWRIGHT 指定本机 Playwright 模块路径、SLIDE_CHROMIUM_EXECUTABLE 指定 Chrome。HTML5 是当前 Slide 的默认实际后端，WebAudio 通过透传 appOptions.enableWebAudio=false 配置。测试每次核对实际后端。

暂停验收检查 App storage 和 Slide 状态、原生音视频的 paused 标记、WebAudio BufferSource，以及连续采样的时间停止推进。播放验收先等待原生 seek 和两轨执行请求完成，再要求实际音频和视频时间推进；WebAudio 必须有已启动、未停止的真实 BufferSource。每次 seek、校准、播放器/BufferSource 更换后重新取已稳定的基线，在同一代次内连续观察至少 300ms 并要求两轨时钟推进及对齐，不能用 seek 跳变或逻辑 play 状态代替播放；重新取基线不延长时钟推进验证阶段的 15 秒截止时间。就绪状态与时间基线在同一次浏览器读取中获取，避免 SDK 重建 App 导致基线失效。功能验收对远端 CDN 资源显式设置 60 秒等待并记录慢下载耗时，原生播放时间推进仍须在 15 秒内出现；此处不验收默认资源下载超时性能。

裁剪视频再次播放时另记录原生视频 seeking、两轨待处理目标和操作代次，保留从暂停到恢复的采样，区分逻辑 play、音频已启动和视频仍在等待定位三种情况。

播放中的 seek 先核对发送状态的时间基准确实编码请求位置，再等待真实房间回送该状态，并按当前房间时间检查两轨位置；网络传输期间播放会继续，不能要求接收后仍恰好停在请求的整秒。播放位置容差沿用房间时钟检查的 1.25 秒（包含整秒定位量化），暂停则仍按实际共享 pause 位置要求 0.2 秒内一致、900ms 不推进及零额外音频启动。

裁剪重播还独立验证两轨均已停在裁剪起点，再检查点击产生的新 play 时间基准确实编码零偏移，随后才按接收时间检查播放位置。报告保留重播前两轨位置、发起时刻、发送状态和三端接收结果，避免状态与媒体共同偏移却自洽通过。

视频播放还要求当前 Pixi 视频图层及其父级可见。合成媒体课件包含有效的矩形几何遮罩，避免原生视频在运行但测试画布为空；源端 intent 门禁另外比较实际合成场景的帧像素，覆盖首播同位置定位后的画面显示。

客户整稿检查逐页完成渲染和三端页码收敛；客户媒体验收使用首页原始视频，另用合成视频/纯音频覆盖完整操作矩阵。动画验收使用含剩余点击步骤的页面，检查引擎及 storage 步骤同步；不代表所有动画内媒体均已验收。快速播放后暂停专门覆盖尚未完成起播的取消路径，其余播放场景必须验证时间推进。旧注册地址重入后会再次验证视频和纯音频播放/暂停及实际后端。

未处理异常、资源 HTTP/传输失败和非预期 console error 均使验收失败。白名单仅包括当前 SDK 的日志 Worker 降级、主动断线错误、切页/销毁的 ERR_ABORTED（WebKit 仅对 MP3/MP4 允许对应 cancelled）、以及有独立 HTTP/传输门禁覆盖的受控 HTTP503 浏览器资源错误消息。另允许 `Warning: render(...): Replacing React-rendered children with a new root component.`：已使用 npm app-slide 0.2.107 在同一白板 1.5 重连/重入路径独立复现，属于现有 WindowManager/Appliance React View 重挂载警告；其他 React 错误仍会阻止验收。

失败同样精确停用本次创建的房间并回读确认 isBan=true、isRecord=false。结果不记录 SDK/Room Token。合成 MP4/MP3 fixture 来自 Slide 的本地 ffmpeg 测试图与正弦音，不含客户内容。

每个房间创建后立即写入不含 token 的 `owned-rooms.json`，在清理后更新回读结果；进程中断或断电后可据此精确恢复清理。媒体失败快照记录执行阶段和错误原因，并在原生 error 事件中保留错误码、原始 message、readyState 和 networkState。MP3/MP4 请求保存角色、Range/响应状态/类型/长度和成功耗时（不含查询参数），用来区分资源响应、解码失败与原生播放等待。

桌面浏览器 E2E 不替代移动设备、录制回放与 RTC/PCM 的独立验收。

禁止自动播放配置通过真实 CDP Runtime（userGesture=false）读取状态和发起房间命令，避免 Playwright 普通 evaluate 自动附带 userGesture=true 使权限测试失效。每组新文档首次起播前断言三端 userActivation.hasBeenActive=false，HTML5 三端均须产生真实权限请求并通过真实点击恢复；WebAudio 验证实际挂起的 AudioContext 在点击后恢复。媒体元素、播放器和原生 Promise 均不替换。

测试宿主通过 White SDK 的 LoggerReportMode.BanReport 和 localLog.enabled=false 关闭非媒体日志上传，避免 Argus 上报地址的 CORS 异常干扰媒体验收；不放行页面未处理异常，不修改生产默认配置，媒体加载错误和真实房间交互仍严格检查。

边界用例重建测试文档后先等待本地 ready；若创建端尚无初始共享 snapshot，则通过真实的第 3 页 → 第 1 页导航建立测试初始状态，随后仍严格检查三端 storage/场景/媒体收敛。HTTP 重试用例验收从该初始状态开始的重建恢复，空 snapshot 的首屏引导时序另行验收。

快速定位可设置 `APP_SLIDE_E2E_DIAGNOSTIC=boundaries`，只运行一组真实房间的边界场景，结果标为 diagnostic、matrixComplete=false，不算完整验收。浏览器选择使用 `APP_SLIDE_E2E_BROWSER=webkit`；`APP_SLIDE_E2E_AUTOPLAY=blocked` 开启实际 Chrome 自动播放限制。权限恢复必须由真实点击触发，并断言共享状态/写入次数/信令数不变。WebAudio 使用真实用户手势恢复原生 AudioContext，不宣称 HTML5 的 SDK 权限回调覆盖所有 WebAudio 设备。

`APP_SLIDE_E2E_DIAGNOSTIC=extended` 单独运行一组冻结/恢复、重连及媒体生命周期检查，仍不算完整验收。报告保存作者端释放前后的积压媒体消息、共享状态及原生启动计数，便于区分旧事件回放与真正的播放失败。

诊断子集可通过 `APP_SLIDE_E2E_DIAGNOSTIC_MODE=1.5` 选择另一套白板配置，默认 1.0；完整验收始终执行两种配置，诊断参数不能缩减发布矩阵。

`APP_SLIDE_E2E_DIAGNOSTIC=animation` 可单独验证动画。动画资源需至少有两个剩余的普通点击步骤，并能在单步 15 秒内完成；单个长视频的播放命令不能代替这项验收。首次点击可能只启动第 0 步，故测试检查实际开始/结束回调、三端步号与状态同步，以及每端画布像素变化，再验证下一步。

重连、冻结与角色恢复使用 300 秒的合成音视频；重连前逐端要求剩余时长超过 200 秒并保存实际值。自然结束仍使用 3 至 15 秒的裁剪段单独验收。素材为 160×90/5FPS 测试图和 440Hz 正弦音，生成命令见本次修复验证记录。

创建任何房间前，独立页面以真实点击启动原生 Audio，要求 15 秒内时钟实际推进；该页面不加载 Slide/White SDK，失败会中止且不创建房间。它的 Context 随后销毁，正式权限测试仍使用全新、无用户激活的 Context。

原生 seek 中暂停分为 `native-audio-seeking-unlocked-pause` 和 `native-video-seeking-unlocked-pause`：视频场景分别在真实音轨和视频 seek 窗口操作，音频场景覆盖音轨窗口。播放中音轨先完成定位，视频再跟随实时音轨，因此不要求两轨同时 seeking。作者端实测指定原生轨道 seeking=true、定位目标为 4 秒且 Howler 播放锁已解除后立即暂停，暂停事件仍经真实房间传播；三端检查共享位置、两轨原生位置、seeking 结束和 900ms 静止。原 pending-play 用例仍通过真实未完成的原生 play Promise 触发，不等待定位完成后再制造取消。

新增视频释放慢音轨验收：只读端冻结后恢复，拦截真实 MP3 请求；在视频元数据就绪、共享播放意图成立后继续扣留音频响应至少 18 秒。期间不得被 15 秒原生播放截止时间误杀，放行真实字节后两轨跟随房间时钟，可写接收端和只读端均无回写，旧节点保持静音。每种浏览器、白板配置和实际音频后端均执行，发布门禁独立核对该前提和结果。

完整验收在创建房间前要求客户 pageCount 为正整数；加载后必须与三端真实 Slide.slideCount 一致，再逐页完成渲染与同步，并保存覆盖集合。发布汇总逐组核对完整页序列。复用输出目录时，开始运行即原子替换旧成功标记为本次 running/false，失败也写入本次 failed 状态。

失败报告同时保留最后一次共享/原生暂停不一致快照，以及每端最多 600 条媒体执行观察。记录区分 track、backend owner 和原生节点，覆盖 freeze/release 后新建播放器的首次定位、实际 seek 写入、settled 和原生 pause/playing/seeking/seeked 事件；事件自身节点与当前 owner 分开记录。观察包装保留原方法的 this、返回值和异常，不替换原生属性或 Promise、不制造事件或增加定时器。诊断模块也计入 harness SHA；报告采集失败不阻止房间清理。

暂停落点按各端实际音视频位置与共享原始暂停时间加裁剪起点比较，误差小于等于 2 秒即通过，恰好 2 秒也接受，不向下取整共享目标。音视频实际暂停、声音停止、定位结束及 900ms 时钟静止继续独立验证。报告记录本次阈值，发布汇总核对该值；播放时钟对齐、故障注入窗口和自然结束归零的检查使用各自合同。

runner 在解析依赖和候选包之前原子写入本轮 initializing/false，初始化失败也记录 failed、runId 和完成时间，避免复用输出目录时遗留旧成功结果。

WebGL context lost、context 数量超限告警保留在报告中，不单独阻断音视频同步验收。画面、声音、操作及三端同步正常即可通过；页面持续 loading、黑屏、播放/暂停失败和状态不一致仍会失败。报告记录 `graphicsContextPolicy=functional-impact`，发布汇总核对相同标准。

原生节点探针继续持有退役节点，以检查旧音源是否重新播放；执行诊断的节点监听器只弱引用 track，媒体关联只保存数字/字符串身份，避免诊断监听器额外保留旧播放器和渲染器。
