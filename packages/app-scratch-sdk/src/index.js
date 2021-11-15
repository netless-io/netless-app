import { createStore } from "redux";
import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";
import { SideEffectManager } from "side-effect-manager";
import { TargetsBinder } from "./vm/targets";

export const UPDATE_STATE = "NETLESS/UPDATE_STATE";

const scratchModules = Object.values(import.meta.globEager("./modules/*.js")).map(m => m.default);

export class NetlessAppScratchSDK {
  constructor(reactClassElement) {
    this.sideEffect = new SideEffectManager();

    this.pApp = createEmbeddedApp().then(app => {
      this.app = app;
      return app;
    });

    this.isAuthor = () => {
      if (import.meta.env.DEV) {
        return Boolean(NetlessAppScratchSDK.__isAuthor);
      }
      return this.app.isWritable && this.app.state["__author"] === this.app.meta.uid;
    };

    const originalComponentWillUnmount = reactClassElement.componentWillUnmount;

    reactClassElement.componentWillUnmount = (...args) => {
      if (originalComponentWillUnmount) {
        originalComponentWillUnmount.apply(reactClassElement, args);
      }
      this.destroy();
    };
  }

  createStore(originReducer, preloadedState, enhancer) {
    this.lastReduxState = null;

    const enhancedReducer = (state, action) => {
      if (action.type === UPDATE_STATE) {
        let newState = state;
        for (let i = 0; i < action.payload.length; i++) {
          const { path, value } = action.payload[i];
          newState = { ...newState };
          let level = newState;
          for (let j = 0; j < path.length; j++) {
            const key = path[j];
            if (j === path.length - 1) {
              level[key] = value;
            } else {
              level[key] = { ...level[key] };
            }
            level = level[key];
          }
        }
        return newState;
      }
      return originReducer(state, action);
    };

    const store = createStore(enhancedReducer, preloadedState, enhancer);

    this.pApp.then(app => {
      if (import.meta.env.DEV) {
        window.app = app;
        window.store = store;
        window.makeAuthor = this.makeAuthor.bind(this);
      }

      this.sideEffect.add(() => {
        const binder = new TargetsBinder(app, store, this.isAuthor);
        return () => binder.destroy();
      });

      this.sideEffect.add(() => {
        const handler = diff => {
          if (!this.isAuthor()) {
            const appState = app.state;
            const reduxState = store.getState();
            const payload = scratchModules.reduce((results, scratchModule) => {
              const result = scratchModule.compareAppState(diff, appState, reduxState);
              return Array.isArray(result) ? results.concat(result) : results;
            }, []);
            if (payload.length > 0) {
              store.dispatch({ type: UPDATE_STATE, payload });
            }
          }
        };
        app.onStateChanged.addListener(handler);
        return () => app.onStateChanged.removeListener(handler);
      });

      this.lastReduxState = store.getState();

      if (app.state.netlessVersion) {
        const appState = app.state;
        const payload = scratchModules.reduce((results, scratchModule) => {
          const result = scratchModule.initialReduxState(appState);
          return Array.isArray(result) ? results.concat(result) : results;
        }, []);
        if (payload.length > 0) {
          store.dispatch({ type: UPDATE_STATE, payload });
        }
      } else if (this.isAuthor()) {
        const newAppState = scratchModules.reduce(
          (appState, scratchModule) => {
            const result = scratchModule.initialAppState(this.lastReduxState);
            return result ? { ...appState, ...result } : appState;
          },
          { netlessVersion: "v1" }
        );
        if (Object.keys(newAppState).length > 0) {
          app.setState(newAppState);
        }
      }

      this.sideEffect.add(() =>
        store.subscribe(() => {
          if (this.isAuthor()) {
            this.sideEffect.setTimeout(
              () => {
                const currReduxState = store.getState();
                const currAppState = app.state;
                const newAppState = scratchModules.reduce((appState, scratchModule) => {
                  const result = scratchModule.compareReduxState(
                    this.lastReduxState,
                    currReduxState,
                    currAppState
                  );
                  return result ? { ...appState, ...result } : appState;
                }, {});
                if (Object.keys(newAppState).length > 0) {
                  app.setState(newAppState);
                }
                this.lastReduxState = currReduxState;
              },
              50,
              "CompareState"
            );
          }
        })
      );
    });

    return store;
  }

  bindMainWorkSpace(workspace, ScratchBlocks) {
    this.pApp.then(app => {
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
    });
  }

  makeAuthor(uid) {
    if (import.meta.env.DEV) {
      NetlessAppScratchSDK.__isAuthor = true;
      return;
    }
    this.app.setState({ __author: uid || this.app.meta.uid });
  }

  destroy() {
    this.sideEffect.flushAll();
  }
}
