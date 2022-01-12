import { ScratchAdapter } from "./scratch-adapter";
import { has } from "lodash-es";

export class ScratchWorkspaceAdapter extends ScratchAdapter {
  bindMainWorkSpace(workspace, ScratchBlocks) {
    this.workspace = workspace;
    this.toolBox = workspace.getFlyout();
    this.ScratchBlocks = ScratchBlocks;

    this.pApp.then(app => {
      if (app.debug) {
        window.workspace = workspace;
      }

      this.workspaceStore = app.connectStore("workspace");
      this.toolBoxStore = app.connectStore("toolBoxWorkspace");

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

      this.bindEvents(this.workspace, "MAIN_WORKSPACE_EVENT");
      this.syncMetrics(this.workspace, this.workspaceStore);

      this.syncToolboxScroll(this.toolBox, this.toolBoxStore);
    });
  }

  bindEvents(workspace, eventType) {
    this.sideEffect.add(() => {
      const handler = event => {
        if (this.isAuthor$.value) {
          this.app.sendMessage({ type: eventType, payload: event.toJson() });
        }
      };
      workspace.addChangeListener(handler);
      return () => workspace.removeChangeListener(handler);
    });

    this.sideEffect.add(() => {
      const handler = message => {
        if (!this.isAuthor$.value) {
          if (message && message.type === eventType) {
            try {
              message.payload.workspaceId = workspace.id;
              const secondaryEvent = this.ScratchBlocks.Events.fromJson(message.payload, workspace);
              secondaryEvent.run(true);
            } catch (e) {
              console.error(e);
            }
          }
        }
      };
      this.app.onMessage.addListener(handler);
      return () => this.app.onMessage.removeListener(handler);
    });
  }

  syncToolboxScroll(toolBox, toolBoxStore) {
    if (has(toolBoxStore.state, "scrollY")) {
      applyToolboxScroll();
    } else if (this.isAuthor$.value) {
      uploadToolboxScroll();
    }

    this.addFunctionListener(toolBox.getWorkspace(), "translate", () => {
      if (this.isAuthor$.value) {
        this.sideEffect.setTimeout(
          () => {
            uploadToolboxScroll();
          },
          50,
          "toolbox-translate"
        );
      }
    });

    this.sideEffect.add(() => {
      const handler = diff => {
        if (!this.isAuthor$.value && diff && diff.scrollY) {
          applyToolboxScroll(toolBox, toolBoxStore);
        }
      };
      toolBoxStore.onStateChanged.addListener(handler);
      return () => toolBoxStore.onStateChanged.removeListener(handler);
    });

    function uploadToolboxScroll() {
      toolBoxStore.setState({
        scrollY: toolBox.getScrollPos() || 0.1, // blockly won't work on 0
      });
    }

    function applyToolboxScroll() {
      if (has(toolBoxStore.state, "scrollY")) {
        toolBox.scrollTo(toolBoxStore.state.scrollY);
      }
    }
  }

  syncMetrics(workspace, workspaceStore) {
    // disable workspace auto resize
    this.sideEffect.add(() => {
      const oldFn = this.workspace.resizeContents;
      const isAuthor$ = this.isAuthor$;
      this.workspace.resizeContents = function (...args) {
        if (isAuthor$.value) {
          oldFn.apply(this, args);
        }
      };
      return () => {
        this.workspace.resizeContents = oldFn;
      };
    });

    if (has(workspaceStore.state, "scrollX") || has(workspaceStore.state, "scrollY")) {
      applyWorkspaceScroll();
    } else if (this.isAuthor$.value) {
      uploadWorkspaceScroll();
    }

    if (has(workspaceStore.state, "scale")) {
      applyWorkspaceScale();
    } else if (this.isAuthor$.value) {
      uploadWorkspaceScale();
    }

    this.addFunctionListener(workspace, "translate", () => {
      if (this.isAuthor$.value) {
        uploadWorkspaceScroll();
      }
    });

    this.addFunctionListener(workspace, "zoom", () => {
      if (this.isAuthor$.value) {
        uploadWorkspaceScale();
      }
    });

    this.sideEffect.add(() => {
      const handler = diff => {
        if (!this.isAuthor$.value && diff) {
          if (diff.scrollX || diff.scrollY) {
            applyWorkspaceScroll();
          }
          if (diff.scale) {
            applyWorkspaceScale();
          }
        }
      };
      workspaceStore.onStateChanged.addListener(handler);
      return () => workspaceStore.onStateChanged.removeListener(handler);
    });

    function uploadWorkspaceScroll() {
      workspaceStore.setState({
        scrollX: workspace.scrollX,
        scrollY: workspace.scrollY,
      });
    }

    function applyWorkspaceScroll() {
      const metrics = workspace.getMetrics();
      // make workspace.scroll work
      workspace.startDragMetrics = metrics;
      const state = workspaceStore.state;
      if (has(state, "scrollX") || has(state, "scrollY")) {
        workspace.scroll(
          has(state, "scrollX") ? state.scrollX : workspace.scrollX,
          has(state, "scrollY") ? state.scrollY : workspace.scrollY
        );
      }
    }

    function uploadWorkspaceScale() {
      workspaceStore.setState({
        scale: workspace.scale,
      });
    }

    function applyWorkspaceScale() {
      const state = workspaceStore.state;
      if (has(state, "scale")) {
        workspace.setScale(state.scale);
      }
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
