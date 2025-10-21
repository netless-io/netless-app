# @netless/app-docs-viewer

A powerful document viewer application for Netless Interactive Whiteboard that supports both static documents and dynamic presentations with real-time collaboration features.

## Features

- 📄 **Static Document Viewing** - PDFs, images, and other static documents with smooth scrolling
- 🎯 **Dynamic Presentation Support** - PowerPoint presentations with slide-by-slide navigation
- 🚀 **High Performance** - Virtualized rendering and lazy loading for large documents
- 🎨 **Interactive Controls** - Zoom, navigation, thumbnail previews, and keyboard shortcuts
- 💾 **Export Capabilities** - PDF export with progress reporting (requires `jspdf`)
- 👥 **Real-time Collaboration** - Synchronized viewing and page positions across users
- 📱 **Responsive Design** - Touch and mouse support with custom scrollbars

## Installation

```bash
npm install @netless/app-docs-viewer
```

### Peer Dependencies

For PDF export functionality, install `jspdf`:

```bash
npm install jspdf
```

## Usage

### Basic Usage

The app automatically detects content type and provides the appropriate viewer:

```typescript
import WindowManager from "@netless/window-manager";
import NetlessAppDocsViewer from "@netless/app-docs-viewer";

// Register the app with WindowManager
WindowManager.register({
  kind: "DocsViewer",
  appOptions: {
    // Set to true to make the viewer readonly when initialized
    justDocsViewReadonly?: true,
  },
  src: NetlessAppDocsViewer,
});

// Now you can create docs viewer windows using the registered kind
const box = await manager.createBox({
  appKind: "DocsViewer",
  title: "Document Viewer",
  style: {
    width: 800,
    height: 600,
  },
  scenes: yourDocumentScenes,
  // Optional app options
  options: {
    justDocsViewReadonly: false, // or true for readonly mode
  }
});
```

### Document Configuration

Documents are provided through Netless scenes configuration. The app automatically detects content type based on the URL pattern and scene structure:

```typescript
// Static document (PDF, images)
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

// Dynamic presentation (converted PPTX)
const dynamicPresentation = {
  scenes: [
    {
      name: "slide1",
      ppt: {
        src: "ppt://example.com/slide1.slide", // URL starting with "ppt" triggers dynamic mode
        width: 1920,
        height: 1080,
        previewURL: "https://example.com/slide1-thumb.png"
      }
    }
  ]
};

// Multiple pages example
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

**Important**: The app looks for the `ppt` field in each scene and uses its properties to create the document pages. Only scenes with a `ppt` field will be processed.

### Advanced Configuration

```typescript
import WindowManager, { createDisplayer } from "@netless/window-manager";
import NetlessAppDocsViewer from "@netless/app-docs-viewer";

// Create window manager
const manager = await WindowManager.create({
  useMobXState: true,
  cursor: true,
  container: document.querySelector("#container")!
});

// Register the docs viewer app before creating any windows
WindowManager.register({
  kind: "DocsViewer",
  appOptions: {
    // Define default app options for all instances
    justDocsViewReadonly?: true,
  },
  src: NetlessAppDocsViewer,
});

// Create a displayer for the whiteboard
const displayer = await createDisplayer({
  // ... your displayer configuration
});

// Add a docs viewer window
const box = await manager.createBox({
  appKind: "DocsViewer", // Use the registered kind
  title: "Document Viewer",
  style: {
    width: 800,
    height: 600
  },
  scenes: yourDocumentScenes,
  options: {
    // Override default app options for this specific instance
    justDocsViewReadonly: false
  }
});
```

## API Reference

### Registration

Register the app with WindowManager before creating any windows:

```typescript
WindowManager.register({
  kind: "DocsViewer",
  appOptions: {
    // Global default options for all instances
    justDocsViewReadonly?: true,
  },
  src: NetlessAppDocsViewer,
});
```

### App Configuration

#### App Options

```typescript
interface NetlessAppDocsViewerOptions {
  /** Make the docs viewer readonly when the app is initialized */
  justDocsViewReadonly?: true;
}
```

#### Document Page Structure

Documents are configured through Netless scenes with the following page structure:

```typescript
interface DocsViewerPage {
  src: string;        // Page or slide URL
  height: number;     // Page height in pixels
  width: number;      // Page width in pixels
  thumbnail?: string; // Optional thumbnail URL for preview
}
```

#### Scene Configuration Example

```typescript
const scenes = [
  {
    name: "page1",
    ppt: { // Important: Use the 'ppt' field for automatic detection
      src: "https://example.com/page1.jpg",
      width: 1920,
      height: 1080,
      previewURL: "https://example.com/page1-thumb.jpg" // Optional
    }
  }
];
```

#### Viewer Modes

1. **Static Mode** - For PDFs and images
   - Continuous scrolling
   - Zoom controls (25% - 400%)
   - Thumbnail sidebar
   - Keyboard navigation (Page Up/Down, Arrow keys)

2. **Dynamic Mode** - For presentations
   - Slide-by-slide navigation
   - Click-to-advance functionality
   - Play/pause controls
   - Keyboard shortcuts (Arrow keys, Space)

### Export Features

```typescript
// Enable PDF export (requires jspdf)
import jsPDF from "jspdf";

// The viewer will automatically detect jspdf availability
// and enable PDF export functionality
```

## Architecture

### Component Structure

```
@netless/app-docs-viewer/
├── DocsViewer/           # Base viewer UI component
├── StaticDocsViewer/     # Static document viewer
├── DynamicDocsViewer/    # Dynamic presentation viewer
├── PageRenderer/        # High-performance virtualized renderer
├── ScrollBar/           # Custom scrollbar component
└── utils/               # Helper functions
```

### Key Features

- **Dual Mode System** - Automatically switches between static and dynamic viewers
- **Performance Optimization** - Virtualized rendering for large document sets
- **Lazy Loading** - On-demand loading of pages and thumbnails
- **Real-time Sync** - Page positions synchronized across all users
- **Responsive Design** - Works on desktop and mobile devices

## Keyboard Shortcuts

| Shortcut | Function | Mode |
|----------|----------|------|
| `←` `→` | Previous/Next page or slide | Both |
| `Page Up` `Page Down` | Previous/Next page | Static |
| `Space` | Play/pause (dynamic) / Next page (static) | Both |
| `+` `-` | Zoom in/out | Static |
| `Home` `End` | First/last page | Both |

## Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/netless-io/netless-app.git
cd netless-app/packages/app-docs-viewer

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building

```bash
npm run build
```

### Testing

The playground serves as a test environment with various document examples:

```bash
# Start playground
npm run playground
```

## Dependencies

- **@juggle/resize-observer** - ResizeObserver polyfill for responsive layout
- **debounce-fn** - Debounced functions for performance optimization
- **vanilla-lazyload** - Lazy loading for images and thumbnails
- **side-effect-manager** - Side effect management

### Optional Dependencies

- **jspdf** - PDF generation and export functionality

## Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## Contributing

Contributions are welcome! Please read our [contributing guidelines](../../CONTRIBUTING.md) for details.

## License

MIT @ [netless](https://github.com/netless-io)

## Related Packages

- [@netless/window-manager](../window-manager/) - Window management system
- [@netless/white-web-sdk](https://github.com/netless-io/white-web-sdk) - Interactive whiteboard SDK
