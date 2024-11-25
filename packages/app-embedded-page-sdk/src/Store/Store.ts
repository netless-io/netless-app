/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Diff } from "@netless/app-embedded-page";
import type { Logger } from "@netless/app-shared";
import type { AkkoObjectUpdatedProperty } from "white-web-sdk";
import { EmbeddedPageEvent } from "../EmbeddedPageEvent";
import type { MaybeRefValue } from "../utils";
import { has, isObj, isRef, makeRef, plainObjectKeys } from "../utils";

export interface TStateLike {
  [key: string]: any;
}

export type StoreOnSetStatePayload<TState = unknown> = {
  [K in keyof TState]?: MaybeRefValue<TState[K]>;
};

export type StoreStateChangedPayload<TState extends TStateLike> = ReadonlyArray<
  AkkoObjectUpdatedProperty<TState, Extract<keyof TState, string>>
>;

export interface Store<TState = unknown> {
  readonly id: string;
  readonly state: TState;
  readonly onStateChanged: EmbeddedPageEvent<Diff<TState>>;
  readonly onDestroyed: EmbeddedPageEvent<void>;
  readonly getIsWritable: () => boolean;
  /** Like React's setState, we only keep track of top level state values. */
  setState(state: Partial<TState>): void;
  /** Only set values for keys that do not exist in state */
  ensureState(state: Partial<TState>): void;
}

export interface StoreConfig<TState = unknown> {
  id: string;
  state?: TState;
  getIsWritable: () => boolean;
  onSetState: (payload: StoreOnSetStatePayload<TState>) => void;
  logger?: Logger | Console;
}

export class StoreImpl<TState extends TStateLike> implements Store<TState> {
  readonly id: string;
  getIsWritable: StoreConfig["getIsWritable"];

  private _state: TState;
  private _onSetState: StoreConfig["onSetState"];
  private _logger: Logger | Console;

  constructor({ id, state, onSetState, getIsWritable, logger = console }: StoreConfig<TState>) {
    this.id = id;
    this._onSetState = onSetState;
    this.getIsWritable = getIsWritable;
    this._logger = logger;

    this._state = {} as TState;

    if (state) {
      plainObjectKeys(state).forEach(key => {
        const rawValue = state[key];
        if (isRef<TState[Extract<keyof TState, string>]>(rawValue)) {
          const { k, v } = rawValue;
          this._state[key] = v;
          if (isObj(v)) {
            this._kMap.set(v, k);
          }
        } else {
          this._state[key] = rawValue;
        }
      });
    }
  }

  get state(): Readonly<TState> {
    return this._state;
  }

  readonly onStateChanged = new EmbeddedPageEvent<Diff<TState>>();

  ensureState(state: Partial<TState>): void {
    return this.setState(
      plainObjectKeys(state).reduce((payload, key) => {
        if (!has(this._state, key)) {
          payload[key] = state[key];
        }
        return payload;
      }, {} as Partial<TState>)
    );
  }

  setState(state: Partial<TState>): void {
    if (this._destroyed) {
      this._logger.error(`Cannot call setState on Store ${this.id} which is destroyed.`);
      return;
    }

    if (!this.getIsWritable()) {
      this._logger.error(`Cannot setState on store ${this.id} without writable access`, state);
      return;
    }

    const keys = plainObjectKeys(state);
    if (keys.length > 0) {
      const payload: StoreOnSetStatePayload<TState> = {};
      keys.forEach(key => {
        const value = state[key];
        if (value === void 0) {
          this._lastValue.set(key, this._state[key]);
          delete this._state[key];
          payload[key] = value;
        } else if (value !== this._state[key]) {
          this._lastValue.set(key, this._state[key]);
          this._state[key] = value as TState[Extract<keyof TState, string>];
          if (isObj(value)) {
            const refValue = makeRef(value);
            this._kMap.set(refValue.v, refValue.k);
            payload[key] = refValue as MaybeRefValue<TState[Extract<keyof TState, string>]>;
          } else {
            payload[key] = value;
          }
        }
      });
      if (Object.keys(payload).length > 0) {
        this._onSetState(payload);
      }
    }
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  private _destroyed = false;

  readonly onDestroyed = new EmbeddedPageEvent<void>();

  _destroy() {
    this._destroyed = true;
    this.onDestroyed.dispatch();
  }

  _updateProperties(actions: StoreStateChangedPayload<TState>): void {
    if (this._destroyed) {
      this._logger.error(`Cannot call _updateProperties on Store ${this.id} which is destroyed.`);
      return;
    }

    if (actions.length > 0) {
      const diffs: Diff<TState> = {};

      actions.forEach(({ key, value, kind }) => {
        let oldValue: TState[Extract<keyof TState, string>] | undefined;
        if (this._lastValue.has(key)) {
          oldValue = this._lastValue.get(key);
          this._lastValue.delete(key);
        }

        switch (kind) {
          case 2: {
            // Removed
            if (has(this._state, key)) {
              oldValue = this._state[key];
              delete this._state[key];
            }
            diffs[key] = { oldValue };
            break;
          }
          default: {
            let newValue = value;

            if (isRef<TState[Extract<keyof TState, string>]>(value)) {
              const { k, v } = value;
              const curValue = this._state[key];
              if (isObj(curValue) && this._kMap.get(curValue) === k) {
                newValue = curValue;
              } else {
                newValue = v;
                if (isObj(v)) {
                  this._kMap.set(v, k);
                }
              }
            }

            if (newValue !== this._state[key]) {
              oldValue = this._state[key];
              this._state[key] = newValue;
            }

            diffs[key] = { newValue, oldValue };
            break;
          }
        }
      });

      this.onStateChanged.dispatch(diffs);
    }
  }

  private _kMap = new WeakMap<object, string>();

  /**
   * `setState` alters local state immediately before sending to server. This will cache the old value for onStateChanged diffing.
   */
  private _lastValue = new Map<string | number | symbol, TState[Extract<keyof TState, string>]>();
}
