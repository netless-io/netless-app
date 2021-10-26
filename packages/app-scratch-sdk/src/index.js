import { createStore } from "redux";
import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";
import { SideEffectManager } from "side-effect-manager";

export const UPDATE_STATE = "NETLESS/UPDATE_STATE";

const scratchModules = Object.values(import.meta.globEager("./modules/*.js"));

export class NetlessAppScratchSDK {
  constructor() {
    this.lastReduxState = null;
    this.sideEffect = new SideEffectManager();
  }

  createStore(originReducer, preloadedState, enhancer) {
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

    window.store = store;
    window.showAlert = () =>
      store.dispatch({
        type: "scratch-gui/alerts/SHOW_ALERT",
        alertId: "importingAsset",
      });

    createEmbeddedApp().then(app => {
      window.app = app;

      this.sideEffect.add(() => {
        const handler = diff => {
          const appState = app.state;
          const reduxState = store.getState();
          const payload = scratchModules.reduce((results, scratchModule) => {
            const result = scratchModule.compareAppState(diff, appState, reduxState);
            return Array.isArray(result) ? results.concat(result) : results;
          }, []);
          if (payload.length > 0) {
            store.dispatch({ type: UPDATE_STATE, payload });
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
      } else {
        const newAppState = scratchModules.reduce((appState, scratchModule) => {
          const result = scratchModule.initialAppState(this.lastReduxState);
          return result ? { ...appState, ...result } : appState;
        }, {});
        if (Object.keys(newAppState).length > 0) {
          app.setState(newAppState);
        }
      }

      this.sideEffect.add(() =>
        store.subscribe(() => {
          this.sideEffect.setTimeout(
            () => {
              const currReduxState = store.getState();
              const newAppState = scratchModules.reduce((appState, scratchModule) => {
                const result = scratchModule.compareReduxState(this.lastReduxState, currReduxState);
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
        })
      );
    });

    return store;
  }

  destroy() {
    this.sideEffect.flushAll();
  }
}
