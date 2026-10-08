import { EventEmitter } from "node:events";

export const SLIDE_EVENTS = Object.fromEntries(
  [
    "renderStart",
    "renderEnd",
    "slideChange",
    "mainSeqStepStart",
    "mainSeqStepEnd",
    "renderError",
    "stateChange",
    "syncDispatch",
    "syncReceive",
  ].map(name => [name, name])
);

// Rendering is replaced; the Controller, config construction, transport and listeners are real.
export class Slide extends EventEmitter {
  public slideCount = 3;
  public slideState = { currentSlideIndex: 1 };
  constructor(public config: Record<string, unknown>) {
    super();
  }
  async destroy() {
    this.removeAllListeners();
  }
}
