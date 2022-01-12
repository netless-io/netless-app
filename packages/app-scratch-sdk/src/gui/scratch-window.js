import { ResizeObserver as ResizeObserverPolyfill } from "@juggle/resize-observer";
import { SideEffectManager } from "side-effect-manager";
import { createSideEffectBinder } from "value-enhancer";
import { identity } from "lodash-es";
import { rootEl$ } from "../utils/root-element";

const ResizeObserver = window.ResizeObserver || ResizeObserverPolyfill;

const WINDOW_SIZE = "window_size";

export function syncScratchWindow(props) {
  const sideEffect = new SideEffectManager();
  const { createVal, combine } = createSideEffectBinder(sideEffect);

  const bodyRect = document.body.getBoundingClientRect();
  const windowSize$ = createVal({ width: bodyRect.width, height: bodyRect.height });

  const rootSize$ = createVal({ width: bodyRect.width, height: bodyRect.height });

  const observer = new ResizeObserver(entries => {
    if (entries && entries[0]) {
      const { width, height } = entries[0].contentRect;
      windowSize$.setValue({ width, height });
    }
  });
  sideEffect.add(() => {
    observer.observe(document.body);
    return () => observer.disconnect();
  });

  sideEffect.addDisposer(
    combine([rootEl$, props.isAuthor$], identity).subscribe(([rootEl, isAuthor]) => {
      sideEffect.add(() => {
        if (!rootEl) return;
        rootEl.style.transformOrigin = "top left";

        if (isAuthor) {
          return windowSize$.subscribe(size => {
            props.app.setState({ [WINDOW_SIZE]: size });
          });
        } else {
          const handler = diff => {
            if (diff[WINDOW_SIZE] && diff[WINDOW_SIZE].newValue) {
              rootSize$.setValue(diff[WINDOW_SIZE].newValue);
            }
          };
          props.app.onStateChanged.addListener(handler);
          return () => props.app.onStateChanged.removeListener(handler);
        }
      }, "root-el");
    })
  );

  sideEffect.addDisposer(
    combine([windowSize$, rootSize$, props.isAuthor$, rootEl$], identity).subscribe(
      ([windowSize, rootSize, isAuthor, rootEl]) => {
        if (rootEl) {
          if (isAuthor) {
            rootEl.style.width = null;
            rootEl.style.height = null;
            rootEl.style.transform = null;
          } else {
            rootEl.style.width = `${rootSize.width}px`;
            rootEl.style.height = `${rootSize.height}px`;
            rootEl.style.transform = `scale(${windowSize.width / rootSize.width},${
              windowSize.height / rootSize.height
            })`;
          }
        }
      }
    )
  );

  return () => sideEffect.flushAll();
}
