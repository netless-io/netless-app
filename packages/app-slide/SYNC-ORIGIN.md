# Slide 同步来源接线

本分支依赖 Slide PR #254 的 `renderEnd(index, origin)` 和
`stateChange(state, origin)`，其中 origin 包含可选的 clientId 和 authorId。
正式 `@netless/slide@1.4.61` 不提供这两个来源参数。发布本分支之前，必须将
package.json 和 pnpm-lock.yaml 更新为包含该能力的已发布 Slide 版本。
构建入口会检查该能力，防止把旧引擎与新的写入规则打包到一起。

## 行为

- `room.uid` 原样传给 Slide 的 clientId；这是 WhiteLogger 的 suid 来源。
  authorId 仍取 Magix envelope，覆盖 payload 同名字段，不使用 clientId 判断写权限。
- 创建 App 的可写客户端在首次有效 renderEnd 补齐数字页场景一次。已存在的页及笔迹
  不删除；后续翻页不会重建场景。仅实际创建场景时设置初始共享 scene path。
- 白板 1.0：可写且 `origin.authorId === room.observerId` 的客户端在 renderEnd
  调用共享 setScenePath。使用回调 index，不读取此时尚未更新的 currentSlideIndex。
- 白板 1.5：以 `manager._appliancePlugin` 是否存在判断。所有客户端在 renderEnd
  调用 `plugin.setViewLocalScenePathChange(scenePath, appId)`。
  这是当前插件实例的实际参数顺序，与部分旧类型声明顺序不同。
- 插件 App View 尚未挂载时最多等待 20 秒，期间只保留最新完成的页码；异步本地切页
  串行执行，销毁时停止重试。插件存在但缺少本地切页 API 时报告错误，不退回共享写入。
- 两种白板的 storage.state 均只由当前可写的事件作者写入；无 origin 的恢复、
  无法判定归属的状态和远端事件不写共享状态。
- 主 UI 页码仍由 slideChange 更新；ready 和 slideChange 不再另行写共享 scene path。

白板 1.0 接收端的 PPT 和标注层仍可能在加载期间短暂不同步。多端主动交错操作没有
引入全局版本号/CAS。本变更解决接收端因本地渲染完成而重复回写的问题。

## 本地候选包验证

先在 netless-ppt-plugin 的 PR #254 分支构建 ppt-player 和 slide；本轮使用
`ce61d015241067a02ae320187445c3e7981cdb33`。然后在 netless-app 根目录运行：

```sh
pnpm --filter @netless/app-slide test
SLIDE_CANDIDATE_DIR=/absolute/path/to/netless-ppt-plugin/packages/slide \
  pnpm --filter @netless/app-slide build
```

SLIDE_CANDIDATE_DIR 同时作用于 Vite 运行时打包和类型生成。它不修改安装目录、
package.json 或锁文件，也不发布 npm 包。

新增回归使用真实 SlideController 和 SceneSync 接线，渲染引擎/白板传输以替身驱动，
覆盖快慢可写端、只读端、同 uid 不同 author、传输 author 覆盖、首次初始化、
恢复无来源、白板 1.5 本地切页、异步排队与挂载/销毁。它不代表真实多人房间或
真实 appliance-plugin Canvas 的端到端验收。
