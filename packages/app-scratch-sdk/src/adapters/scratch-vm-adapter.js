import { createStore } from "redux";
import { TargetsBinder } from "../vm/targets";
import { ScratchAdapter } from "./scratch-adapter";

const UPDATE_STATE = "NETLESS/UPDATE_STATE";

const scratchModules = Object.values(import.meta.globEager("./modules/*.js")).map(m => m.default);

export class ScratchVMAdapter extends ScratchAdapter {
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
      if (app.debug) {
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
          }
        })
      );
    });

    return store;
  }
}
