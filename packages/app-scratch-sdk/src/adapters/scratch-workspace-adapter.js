import { ScratchAdapter } from "./scratch-adapter";

export class ScratchWorkspaceAdapter extends ScratchAdapter {
  bindMainWorkSpace(workspace, ScratchBlocks) {
    this.pApp.then(app => {
      if (app.debug) {
        window.workspace = workspace;
      }

      const MAIN_WORKSPACE_EVENT = "MAIN_WORKSPACE_EVENT";

      this.sideEffect.add(() => {
        const handler = event => {
          if (this.isAuthor()) {
            app.sendMessage({ type: MAIN_WORKSPACE_EVENT, payload: event.toJson() });
          }
        };
        workspace.addChangeListener(handler);
        return () => workspace.removeChangeListener(handler);
      });

      this.sideEffect.add(() => {
        const handler = message => {
          if (!this.isAuthor()) {
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

      // this.sideEffect.add(() => {
      //   const handler = diff => {
      //     if (!this.isAuthor()) {
      //       if (diff[WORKSPACE_METRICS]) {
      //         console.log(
      //           "workspace changed",
      //           diff[WORKSPACE_METRICS].newValue.id,
      //           workspace.id,
      //           diff[WORKSPACE_METRICS].newValue,
      //           workspace
      //         );
      //         // workspace.setMetrics({ x: , y: })
      //       }
      //     }
      //   };
      //   app.onStateChanged.addListener(handler);
      //   return () => app.onStateChanged.removeListener(handler);
      // });
    });
  }
}
