export type Listener<T> = (event: T) => void;

export class EmbeddedPageEvent<TMessage> {
  listeners = new Set<Listener<TMessage>>();

  get length(): number {
    return this.listeners.size;
  }

  dispatch(message: TMessage): void {
    this.listeners.forEach(callback => callback(message));
  }

  addListener(listener: Listener<TMessage>): void {
    this.listeners.add(listener);
  }

  removeListener(listener: Listener<TMessage>): void {
    this.listeners.delete(listener);
  }
}
