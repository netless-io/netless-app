declare module "plyr" {
  class Plyr {
    constructor(element: Element, options?: Record<string, unknown>);

    currentTime: number;
    duration: number;
    muted: boolean;
    paused: boolean;
    volume: number;
    elements: {
      buttons: { play?: HTMLElement | HTMLElement[] };
      controls?: HTMLElement;
    };

    destroy(): void;
    on(event: string, listener: () => void): void;
    once(event: string, listener: () => void): void;
    pause(): void;
    play(): Promise<void>;
    stop(): void;
  }

  export default Plyr;
}
