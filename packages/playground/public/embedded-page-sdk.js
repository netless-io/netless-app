// build from app-embedded-page-sdk
var X = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) =>
    key in obj
      ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value })
      : (obj[key] = value);
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop)) __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop)) __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __markAsModule = target => __defProp(target, "__esModule", { value: true });
  var __export = (target, all) => {
    __markAsModule(target);
    for (var name in all) __defProp(target, name, { get: all[name], enumerable: true });
  };

  // packages/app-embedded-page-sdk/src/index.ts
  var src_exports = {};
  __export(src_exports, {
    createEmbeddedApp: () => createEmbeddedApp,
  });

  // node_modules/.pnpm/side-effect-manager@0.1.2/node_modules/side-effect-manager/dist/side-effect-manager.es.js
  var s = class {
    constructor() {
      (this.disposers = new Map()), (this.disposerIDGenCount = -1);
    }
    add(s2, e = this.genDisposerID()) {
      return this.flush(e), this.disposers.set(e, s2()), e;
    }
    addEventListener(s2, e, t, r, i = this.genDisposerID()) {
      return (
        this.add(() => (s2.addEventListener(e, t, r), () => s2.removeEventListener(e, t, r)), i), i
      );
    }
    setTimeout(s2, e, t = this.genDisposerID()) {
      return this.add(() => {
        const r = window.setTimeout(() => {
          this.remove(t), s2();
        }, e);
        return () => window.clearTimeout(r);
      }, t);
    }
    setInterval(s2, e, t = this.genDisposerID()) {
      return this.add(() => {
        const t2 = window.setInterval(s2, e);
        return () => window.clearInterval(t2);
      }, t);
    }
    remove(s2) {
      const e = this.disposers.get(s2);
      return this.disposers.delete(s2), e;
    }
    flush(s2) {
      const e = this.remove(s2);
      if (e)
        try {
          e();
        } catch (t) {
          console.error(t);
        }
    }
    flushAll() {
      this.disposers.forEach(s2 => {
        try {
          s2();
        } catch (e) {
          console.error(e);
        }
      }),
        this.disposers.clear();
    }
    genDisposerID() {
      const { MAX_SAFE_INTEGER: s2 = 9007199254740991 } = Number;
      return (
        (this.disposerIDGenCount = (this.disposerIDGenCount + 1) % s2),
        `disposer-${this.disposerIDGenCount}`
      );
    }
  };

  // packages/app-embedded-page-sdk/src/utils.ts
  function isObj(e) {
    return typeof e === "object" && e !== null;
  }

  // packages/app-embedded-page-sdk/src/index.ts
  function createEmitter() {
    const listeners = new Set();
    const dispatch = event => listeners.forEach(f => f(event));
    const addListener = listener => listeners.add(listener);
    const removeListener = listener => listeners.delete(listener);
    return { dispatch, addListener, removeListener };
  }
  function createEmbeddedApp(state) {
    state = __spreadValues({}, state);
    const onInit = createEmitter();
    const onStateChanged = createEmitter();
    const onMessage = createEmitter();
    const sideEffectManager = new s();
    let onStateChangedPayload;
    sideEffectManager.addEventListener(window, "message", e => {
      if (!isObj(e.data)) {
        console.warn("window message data should be object, instead got", e.data);
        return;
      }
      const event = e.data;
      if (event.type === "Init") {
        state = __spreadValues(__spreadValues({}, state), event.payload);
        onInit.dispatch(state);
      } else if (event.type === "GetState") {
        state = event.payload;
        if (onStateChangedPayload) {
          onStateChanged.dispatch(onStateChangedPayload);
          onStateChangedPayload = void 0;
        }
      } else if (event.type === "StateChanged") {
        onStateChangedPayload = event.payload;
        parent.postMessage({ type: "GetState" }, "*");
      } else if (event.type === "ReceiveMessage") {
        onMessage.dispatch(event.payload);
      }
    });
    const setState = newState => {
      for (const [key, value] of Object.entries(newState)) {
        if (value === void 0) {
          delete state[key];
        } else {
          state[key] = value;
        }
      }
      parent.postMessage({ type: "SetState", payload: newState }, "*");
    };
    const sendMessage = payload => {
      parent.postMessage({ type: "SendMessage", payload }, "*");
    };
    const destroy = () => sideEffectManager.flushAll();
    return {
      get state() {
        return state;
      },
      onInit,
      setState,
      onStateChanged,
      sendMessage,
      onMessage,
      destroy,
    };
  }
  return src_exports;
})();
