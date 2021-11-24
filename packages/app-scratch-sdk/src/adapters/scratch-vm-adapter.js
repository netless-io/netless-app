import { createStore } from "redux";
import { size } from "lodash-es";
import { Gui } from "../gui";
import { TargetsBinder } from "../vm/targets";
import { ScratchAdapter } from "./scratch-adapter";

const UPDATE_STATE = "NETLESS/UPDATE_STATE";

const scratchModules = Object.values(import.meta.globEager("../modules/*.js")).map(m => m.default);

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

    this.reduxStore = createStore(enhancedReducer, preloadedState, enhancer);

    this.pApp.then(app => {
      if (app.debug) {
        window.vmAdapter = this;
      }

      this.reduxAppStore = app.connectStore("ReduxStore");

      this.sideEffect.add(() => {
        const binder = new TargetsBinder(
          app,
          this.reduxStore.getState().scratchGui.vm,
          this.isAuthor$
        );
        return () => binder.destroy();
      });

      this.lastReduxState = this.reduxStore.getState();

      this.sideEffect.add(() =>
        this.isAuthor$.subscribe(isAuthor => {
          this.sideEffect.add(() => {
            this.initSync();
            if (isAuthor) {
              return this.syncReduxStateToApp();
            } else {
              return this.syncAppStateToRedux();
            }
          }, "sync-redux-app-state");
        })
      );

      if (app.debug) {
        window.vmAdapter = this;
      }

      this.gui = new Gui({
        app,
        author$: this.author$,
        isAuthor$: this.isAuthor$,
        makeAuthor: this.makeAuthor,
        isWritable$: this.isWritable$,
      });

      this.gui.render();
    });

    return this.reduxStore;
  }

  initSync() {
    const appState = this.reduxAppStore.state;
    if (size(appState) > 0) {
      const payload = scratchModules.reduce((results, scratchModule) => {
        const result = scratchModule.initialReduxState(appState);
        return Array.isArray(result) ? results.concat(result) : results;
      }, []);
      if (payload.length > 0) {
        this.reduxStore.dispatch({ type: UPDATE_STATE, payload });
      }
    } else {
      if (this.isAuthor$.value) {
        const newAppState = scratchModules.reduce((appState, scratchModule) => {
          const result = scratchModule.initialAppState(this.lastReduxState);
          return result ? { ...appState, ...result } : appState;
        }, {});
        if (Object.keys(newAppState).length > 0) {
          this.reduxAppStore.setState(newAppState);
        }
      }
    }
  }

  syncReduxStateToApp() {
    return this.reduxStore.subscribe(() => {
      if (this.isAuthor$.value) {
        const currReduxState = this.reduxStore.getState();
        const currAppState = this.reduxAppStore.state;
        const newAppState = scratchModules.reduce((appState, scratchModule) => {
          const result = scratchModule.compareReduxState(
            this.lastReduxState,
            currReduxState,
            currAppState
          );
          return result ? { ...appState, ...result } : appState;
        }, {});
        if (Object.keys(newAppState).length > 0) {
          this.reduxAppStore.setState(newAppState);
        }
        this.lastReduxState = currReduxState;
      }
    });
  }

  syncAppStateToRedux() {
    const handler = diff => {
      if (!this.isAuthor$.value) {
        const reduxState = this.reduxStore.getState();
        const appState = this.reduxAppStore.state;
        const payload = scratchModules.reduce((results, scratchModule) => {
          const result = scratchModule.compareAppState(diff, appState, reduxState);
          return Array.isArray(result) ? results.concat(result) : results;
        }, []);
        if (payload.length > 0) {
          this.reduxStore.dispatch({ type: UPDATE_STATE, payload });
        }
      }
    };
    this.reduxAppStore.onStateChanged.addListener(handler);
    return () => this.reduxAppStore.onStateChanged.removeListener(handler);
  }
}
