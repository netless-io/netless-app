export type EmbeddedPageEventListener<T> = (event: T) => void;

export class EmbeddedPageEvent<TMessage> {
  listeners = new Set<EmbeddedPageEventListener<TMessage>>();

  get length(): number {
    return this.listeners.size;
  }

  dispatch(message: TMessage): void {
    this.listeners.forEach(callback => callback(message));
  }

  addListener(listener: EmbeddedPageEventListener<TMessage>): void {
    this.listeners.add(listener);
  }

  removeListener(listener: EmbeddedPageEventListener<TMessage>): void {
    this.listeners.delete(listener);
  }
}
