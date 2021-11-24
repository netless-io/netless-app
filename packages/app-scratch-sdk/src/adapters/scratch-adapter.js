import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";
import { SideEffectManager } from "side-effect-manager";
import { createSideEffectBinder } from "value-enhancer";

export class ScratchAdapter {
  constructor(reactClassElement) {
    this.sideEffect = new SideEffectManager();
    const { createVal, combine } = createSideEffectBinder(this.sideEffect);

    if (!ScratchAdapter.__pApp) {
      ScratchAdapter.__pApp = createEmbeddedApp();
    }

    this.isWritable$ = createVal(false);
    this.author$ = createVal(null);

    this.isAuthor$ = combine([this.isWritable$, this.author$], ([isWritable, author]) =>
      Boolean(this.app && isWritable && author === this.app.meta.uid)
    );

    this.makeAuthor = uid => {
      if (this.app && this.app.isWritable) {
        this.app.setState({ __author: uid || this.app.meta.uid });
      }
    };

    this.pApp = ScratchAdapter.__pApp.then(app => {
      this.app = app;

      this.sideEffect.add(() => {
        const handler = () => {
          this.isWritable$.setValue(app.isWritable);
        };
        app.onWritableChanged.addListener(handler);
        return () => app.onWritableChanged.removeListener(handler);
      });
      this.isWritable$.setValue(app.isWritable);

      this.sideEffect.add(() => {
        const handler = diff => {
          if (diff.__author) {
            this.author$.setValue(app.state.__author);
          }
        };
        app.onStateChanged.addListener(handler);
        return () => app.onStateChanged.removeListener(handler);
      });
      if (app.state.__author && app.roomMembers.some(member => member.uid === app.state.__author)) {
        this.author$.setValue(app.state.__author);
      } else if (app.isWritable && app.roomMembers.length > 0) {
        app.setState({ __author: app.roomMembers[0].uid });
      }

      return app;
    });

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

  destroy() {
    this.sideEffect.flushAll();
  }
}
