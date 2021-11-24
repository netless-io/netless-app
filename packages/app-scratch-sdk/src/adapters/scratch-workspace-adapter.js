import { ScratchAdapter } from "./scratch-adapter";
import { has } from "lodash-es";

export class ScratchWorkspaceAdapter extends ScratchAdapter {
  bindMainWorkSpace(workspace, ScratchBlocks) {
    this.workspace = workspace;
    this.ScratchBlocks = ScratchBlocks;

    this.pApp.then(app => {
      if (app.debug) {
        window.workspace = workspace;
      }

      this.workspaceStore = app.connectStore("workspace");

      const style = document.createElement("style");
      style.textContent = `
        g.blocklyDraggable {
          transition: transform 0.4s;
        }
        .blocklyFlyout g.blocklyDraggable {
          transition: none;
        }
      `;
      document.head.appendChild(style);

      const MAIN_WORKSPACE_EVENT = "MAIN_WORKSPACE_EVENT";

      this.sideEffect.add(() => {
        const handler = event => {
          if (this.isAuthor$.value) {
            app.sendMessage({ type: MAIN_WORKSPACE_EVENT, payload: event.toJson() });
          }
        };
        workspace.addChangeListener(handler);
        return () => workspace.removeChangeListener(handler);
      });

      this.sideEffect.add(() => {
        const handler = message => {
          if (!this.isAuthor$.value) {
            if (message && message.type === MAIN_WORKSPACE_EVENT) {
              try {
                message.payload.workspaceId = workspace.id;
                const secondaryEvent = ScratchBlocks.Events.fromJson(message.payload, workspace);
                secondaryEvent.run(true);
              } catch (e) {
                console.error(e);
              }
            }
          }
        };
        app.onMessage.addListener(handler);
        return () => app.onMessage.removeListener(handler);
      });

      this.syncMetrics();
    });
  }

  syncMetrics() {
    if (this.isAuthor$.value) {
      this.workspaceStore.setState({
        scrollX: this.workspace.scrollX,
        scrollY: this.workspace.scrollY,
        scale: this.workspace.scale,
      });
    } else {
      this.applyScroll();
      this.applyScale();
    }

    this.addFunctionListener(this.workspace, "translate", () => {
      if (this.isAuthor$.value) {
        this.workspaceStore.setState({
          scrollX: this.workspace.scrollX,
          scrollY: this.workspace.scrollY,
        });
      }
    });

    this.addFunctionListener(this.workspace, "zoom", () => {
      if (this.isAuthor$.value) {
        this.workspaceStore.setState({
          scale: this.workspace.scale,
        });
      }
    });

    this.sideEffect.add(() => {
      const handler = diff => {
        if (!this.isAuthor$.value && diff) {
          if (diff.scrollX || diff.scrollY) {
            this.applyScroll();
          }
          if (diff.scale) {
            this.applyScale();
          }
        }
      };
      this.workspaceStore.onStateChanged.addListener(handler);
      return () => this.workspaceStore.onStateChanged.removeListener(handler);
    });
  }

  applyScroll() {
    // make workspace.scroll work
    this.workspace.startDragMetrics = this.workspace.getMetrics();
    const state = this.workspaceStore.state;
    if (has(state, "scrollX") || has(state, "scrollY")) {
      this.workspace.scroll(
        has(state, "scrollX") ? state.scrollX : this.workspace.scrollX,
        has(state, "scrollY") ? state.scrollY : this.workspace.scrollY
      );
    }
  }

  applyScale() {
    const state = this.workspaceStore.state;
    if (has(state, "scale")) {
      this.workspace.setScale(state.scale);
    }
  }

  addFunctionListener(object, property, callback) {
    return this.sideEffect.add(() => {
      const oldFn = object[property];
      object[property] = function (...args) {
        const result = oldFn.apply(this, args);
        callback.call(this, result);
        return result;
      };
      return () => {
        object[property] = oldFn;
      };
    });
  }
}
