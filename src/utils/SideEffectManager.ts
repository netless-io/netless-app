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

    public addEventListener<K extends keyof HTMLElementEventMap>(
        el: HTMLElement,
        type: K,
        listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ): string {
        el.addEventListener(type, listener, options);

        const disposerID = this.genDisposerID();

        this.disposers.set(disposerID, () => {
            el.removeEventListener(type, listener);
        });

        return disposerID;
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
