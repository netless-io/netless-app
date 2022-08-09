## Changelog

### 0.3.0

- Follow @netless/window-manager 1.0 api change
- Move @netless/slide to `dependencies`, so that people can upgrade it directly
- Remove slide controller, it was replaced by `SlideViewer`.
- `renderOptions` are moved to `attributes.renderOptions`, including:

  ```js
  minFPS: options.minFPS || 25,
  maxFPS: options.maxFPS || 30,
  autoFPS: options.autoFPS ?? true,
  autoResolution: options.autoResolution ?? true,
  resolution: options.resolution,
  maxResolutionLevel: options.maxResolutionLevel,
  transactionBgColor: options.transactionBgColor || make_bg_color(),
  ```
