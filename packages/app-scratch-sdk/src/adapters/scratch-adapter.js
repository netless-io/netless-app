import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";
import { SideEffectManager } from "side-effect-manager";

export class ScratchAdapter {
  constructor(reactClassElement) {
    this.sideEffect = new SideEffectManager();

    if (!ScratchAdapter.__pApp) {
      ScratchAdapter.__pApp = createEmbeddedApp();
    }

    this.pApp = ScratchAdapter.__pApp.then(app => {
      this.app = app;
      return app;
    });

    this.isAuthor = () => {
      if (import.meta.env.DEV) {
        return Boolean(ScratchAdapter.__isAuthor);
      }
      return this.app.isWritable && this.app.state["__author"] === this.app.meta.uid;
    };

    if (reactClassElement && reactClassElement.render) {
      const originalComponentWillUnmount = reactClassElement.componentWillUnmount;

      reactClassElement.componentWillUnmount = (...args) => {
        if (originalComponentWillUnmount) {
          originalComponentWillUnmount.apply(reactClassElement, args);
        }
        this.destroy();
      };
    }
  }

  makeAuthor(uid) {
    if (import.meta.env.DEV) {
      ScratchAdapter.__isAuthor = true;
      return;
    }
    this.app.setState({ __author: uid || this.app.meta.uid });
  }

  destroy() {
    this.sideEffect.flushAll();
  }
}
