import type { SideEffectManager } from "./SideEffectManager";
import type {
  Options,
  DebouncedFunction,
  BeforeOptions,
  NoBeforeNoAfterOptions,
} from "debounce-fn";
import debounceFn from "debounce-fn";

export interface Debounce {
  <ArgumentsType extends unknown[], ReturnType>(
    input: (...args: ArgumentsType) => ReturnType,
    options: BeforeOptions
  ): DebouncedFunction<ArgumentsType, ReturnType>;
  <ArgumentsType extends unknown[], ReturnType>(
    input: (...args: ArgumentsType) => ReturnType,
    options: NoBeforeNoAfterOptions
  ): DebouncedFunction<ArgumentsType, undefined>;
  <ArgumentsType extends unknown[], ReturnType>(
    input: (...args: ArgumentsType) => ReturnType,
    options?: Options
  ): DebouncedFunction<ArgumentsType, ReturnType | undefined>;
}

export function createDebounce(sideEffect: SideEffectManager): Debounce {
  const debounce: Debounce = (input, options) => {
    const dFn = debounceFn(input, options);
    sideEffect.addDisposer(() => dFn.cancel());
    return dFn;
  };
  return debounce;
}
