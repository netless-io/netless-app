# @netless/app-docs-viewer

一个专为 Netless 互动白板设计的强大文档查看器应用，支持静态文档和动态演示文稿的实时协作功能。

## 功能特性

- 📄 **静态文档查看** - 支持 PDF、图片等静态文档的流畅滚动
- 🎯 **动态演示文稿支持** - PowerPoint 演示文稿的逐页导航
- 🚀 **高性能** - 针对大型文档集的虚拟化渲染和懒加载
- 🎨 **交互式控件** - 缩放、导航、缩略图预览和键盘快捷键
- 💾 **导出功能** - 带进度报告的 PDF 导出（需要 `jspdf`）
- 👥 **实时协作** - 跨用户同步查看和页面位置
- 📱 **响应式设计** - 触摸和鼠标支持，以及自定义滚动条

## 安装

```bash
npm install @netless/app-docs-viewer
```

### 可选依赖

如果需要 PDF 导出功能，请安装 `jspdf`：

```bash
npm install jspdf
```

## 使用方法

### 基础用法

应用会自动检测内容类型并提供相应的查看器：

```typescript
import WindowManager from "@netless/window-manager";
import NetlessAppDocsViewer from "@netless/app-docs-viewer";

// 向 WindowManager 注册应用
WindowManager.register({
  kind: "DocsViewer",
  appOptions: {
    // 设置为 true 可在应用初始化时设为只读模式
    justDocsViewReadonly?: true,
  },
  src: NetlessAppDocsViewer,
});

// 现在可以使用注册的 kind 创建文档查看器窗口
const box = await manager.createBox({
  appKind: "DocsViewer",
  title: "文档查看器",
  style: {
    width: 800,
    height: 600,
  },
  scenes: yourDocumentScenes,
  // 可选的应用选项
  options: {
    justDocsViewReadonly: false, // 或 true 表示只读模式
  }
});
```

### 文档配置

文档通过 Netless 场景配置提供：

```typescript
// 静态文档（PDF、图片）
const staticDocs = {
  scenes: [
    {
      name: "page1",
      ppt: {
        src: "https://example.com/page1.jpg",
        width: 1920,
        height: 1080,
        previewURL: "https://example.com/page1-thumb.jpg"
      }
    }
  ]
};

// 动态演示文稿（转换后的 PPTX）
const dynamicPresentation = {
  scenes: [
    {
      name: "slide1",
      ppt: {
        src: "ppt://example.com/slide1.slide", // 以 "ppt" 开头的 URL 触发动态模式
        width: 1920,
        height: 1080,
        previewURL: "https://example.com/slide1-thumb.png"
      }
    }
  ]
};

// 多页面示例
const multiPageDocument = {
  scenes: [
    {
      name: "page1",
      ppt: {
        src: "https://example.com/page1.jpg",
        width: 1920,
        height: 1080,
        previewURL: "https://example.com/page1-thumb.jpg"
      }
    },
    {
      name: "page2",
      ppt: {
        src: "https://example.com/page2.jpg",
        width: 1920,
        height: 1080,
        previewURL: "https://example.com/page2-thumb.jpg"
      }
    }
  ]
};
```

**重要提示**：应用会查找每个场景中的 `ppt` 字段，并使用其属性创建文档页面。只有包含 `ppt` 字段的场景才会被处理。

### 高级配置

```typescript
import WindowManager, { createDisplayer } from "@netless/window-manager";
import NetlessAppDocsViewer from "@netless/app-docs-viewer";

// 创建窗口管理器
const manager = await WindowManager.create({
  useMobXState: true,
  cursor: true,
  container: document.querySelector("#container")!
});

// 在创建任何窗口之前注册文档查看器应用
WindowManager.register({
  kind: "DocsViewer",
  appOptions: {
    // 为所有实例定义默认应用选项
    justDocsViewReadonly?: true,
  },
  src: NetlessAppDocsViewer,
});

// 为白板创建显示器
const displayer = await createDisplayer({
  // ... 你的显示器配置
});

// 添加文档查看器窗口
const box = await manager.createBox({
  appKind: "DocsViewer", // 使用注册的 kind
  title: "文档查看器",
  style: {
    width: 800,
    height: 600
  },
  scenes: yourDocumentScenes,
  options: {
    // 为此特定实例覆盖默认应用选项
    justDocsViewReadonly: false
  }
});
```

## API 参考

### 注册

在创建任何窗口之前向 WindowManager 注册应用：

```typescript
WindowManager.register({
  kind: "DocsViewer",
  appOptions: {
    // 所有实例的全局默认选项
    justDocsViewReadonly?: true,
  },
  src: NetlessAppDocsViewer,
});
```

### 应用配置

#### 应用选项

```typescript
interface NetlessAppDocsViewerOptions {
  /** 在应用初始化时使文档查看器变为只读模式 */
  justDocsViewReadonly?: true;
}
```

#### 文档页面结构

文档通过 Netless 场景配置，使用以下页面结构：

```typescript
interface DocsViewerPage {
  src: string;        // 页面或幻灯片 URL
  height: number;     // 页面高度（像素）
  width: number;      // 页面宽度（像素）
  thumbnail?: string; // 可选的缩略图 URL 用于预览
}
```

#### 场景配置示例

```typescript
const scenes = [
  {
    name: "page1",
    ppt: { // 重要：使用 'ppt' 字段进行自动检测
      src: "https://example.com/page1.jpg",
      width: 1920,
      height: 1080,
      previewURL: "https://example.com/page1-thumb.jpg" // 可选
    }
  }
];
```

#### 查看器模式

1. **静态模式** - 用于 PDF 和图片
   - 连续滚动
   - 缩放控件（25% - 400%）
   - 缩略图侧边栏
   - 键盘导航（Page Up/Down、方向键）

2. **动态模式** - 用于演示文稿
   - 逐页幻灯片导航
   - 点击前进功能
   - 播放/暂停控件
   - 键盘快捷键（方向键、空格键）

### 导出功能

```typescript
// 启用 PDF 导出（需要 jspdf）
import jsPDF from "jspdf";

// 查看器会自动检测 jspdf 的可用性
// 并启用 PDF 导出功能
```

## 架构

### 组件结构

```
@netless/app-docs-viewer/
├── DocsViewer/           # 基础查看器 UI 组件
├── StaticDocsViewer/     # 静态文档查看器
├── DynamicDocsViewer/    # 动态演示文稿查看器
├── PageRenderer/        # 高性能虚拟化渲染器
├── ScrollBar/           # 自定义滚动条组件
└── utils/               # 辅助函数
```

### 核心功能

- **双模式系统** - 在静态和动态查看器之间自动切换
- **性能优化** - 针对大型文档集的虚拟化渲染
- **懒加载** - 按需加载页面和缩略图
- **实时同步** - 跨所有用户同步页面位置
- **响应式设计** - 支持桌面和移动设备

## 键盘快捷键

| 快捷键 | 功能 | 模式 |
|--------|------|------|
| `←` `→` | 上一页/下一页或幻灯片 | 全部 |
| `Page Up` `Page Down` | 上一页/下一页 | 静态 |
| `Space` | 播放/暂停（动态）/ 下一页（静态） | 全部 |
| `+` `-` | 放大/缩小 | 静态 |
| `Home` `End` | 第一页/最后一页 | 全部 |

## 开发

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/netless-io/netless-app.git
cd netless-app/packages/app-docs-viewer

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 构建

```bash
npm run build
```

### 测试

playground 作为测试环境，提供各种文档示例：

```bash
# 启动 playground
npm run playground
```

## 依赖

- **@juggle/resize-observer** - 响应式布局的 ResizeObserver polyfill
- **debounce-fn** - 用于性能优化的防抖函数
- **vanilla-lazyload** - 图片和缩略图的懒加载
- **side-effect-manager** - 副作用管理

### 可选依赖

- **jspdf** - PDF 生成和导出功能

## 浏览器支持

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## 贡献

欢迎贡献！请阅读我们的[贡献指南](../../CONTRIBUTING.md)了解详情。

## 许可证

MIT @ [netless](https://github.com/netless-io)

## 相关包

- [@netless/window-manager](../window-manager/) - 窗口管理系统
- [@netless/white-web-sdk](https://github.com/netless-io/white-web-sdk) - 互动白板 SDK