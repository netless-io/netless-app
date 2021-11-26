import { Val } from "value-enhancer";

export const rootEl$ = new Val();

export function markRootElement(el) {
  rootEl$.setValue(el);
}
