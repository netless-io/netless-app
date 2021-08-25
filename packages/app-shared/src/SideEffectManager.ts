export type SideEffectDisposer = () => void;

export class SideEffectManager {
  public add(
    executor: () => SideEffectDisposer,
    disposerID: string = this.genDisposerID()
  ): string {
    this.flush(disposerID);
    this.disposers.set(disposerID, executor());
    return disposerID;
  }

  public addDisposer(
    disposer: SideEffectDisposer,
    disposerID: string = this.genDisposerID()
  ): string {
    return this.add(() => disposer, disposerID);
  }

  public addEventListener<K extends keyof WindowEventMap>(
    el: Window,
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): string
  public addEventListener<K extends keyof DocumentEventMap>(
    el: Document,
    type: K,
    listener: (this: Document, ev: DocumentEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): string
  public addEventListener<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions
  ): string
  public addEventListener(
    el: HTMLElement | Window | Document,
    type: string,
    listener: (this: HTMLElement | Window | Document, ev: Event) => unknown,
    options?: boolean | AddEventListenerOptions
  ): string {
    el.addEventListener(type, listener, options);

    const disposerID = this.genDisposerID();

    this.disposers.set(disposerID, () => {
      el.removeEventListener(type, listener);
    });

    return disposerID;
  }

  public setTimeout(
    handler: () => void,
    timeout: number,
    disposerID: string = this.genDisposerID()
  ): void {
    const timeoutHandler = (): void => {
      handler();
      this.remove(disposerID);
    };
    const ticket = window.setTimeout(timeoutHandler, timeout);
    this.disposers.set(disposerID, () => {
      window.clearTimeout(ticket);
    });
  }

  /**
   * remove but not run the disposer
   * @param disposerID
   */
  public remove(disposerID: string): SideEffectDisposer | undefined {
    const disposer = this.disposers.get(disposerID);
    this.disposers.delete(disposerID);
    return disposer;
  }

  /**
   * remove and run the disposer
   * @param disposerID
   */
  public flush(disposerID?: string): void {
    if (disposerID) {
      const disposer = this.remove(disposerID);
      if (disposer) {
        try {
          disposer();
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      this.disposers.forEach((disposer) => {
        try {
          disposer();
        } catch (e) {
          console.error(e);
        }
      });
      this.disposers.clear();
    }
  }

  public disposers = new Map<string, SideEffectDisposer>();

  private disposerIDGenCount = 1;

  private genDisposerID(): string {
    return `disposer-${this.disposerIDGenCount++}`;
  }
}
