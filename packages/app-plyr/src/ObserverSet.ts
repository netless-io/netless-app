export type ObserverCallback<K> = (operation: 'add' | 'delete' | 'update', value: K) => void;

export class ObserverSet<K extends string | number | symbol> {
  private _set: Set<K>;
  private _observers: Set<ObserverCallback<K>> = new Set();

  constructor(values?: readonly K[] | null) {
    this._set = new Set(values);
  }

  private notifyObservers(operation: 'add' | 'delete' | 'update', value: K): void {
    for (const observer of this._observers) {
      observer(operation, value);
    }
  }

  observe(callback: ObserverCallback<K>): void {
    this._observers.add(callback);
  }

  unobserve(callback: ObserverCallback<K>): void {
    this._observers.delete(callback);
  }

  add(value: K): this {
    const notifyKey = this._set.has(value) ? 'update' : 'add';
    this._set.add(value);
    this.notifyObservers(notifyKey, value);
    return this;
  }

  has(value: K): boolean {
    return this._set.has(value);
  }

  delete(value: K): boolean {
    const _value = this._set.has(value);
    const bol = this._set.delete(value);
    if (_value) {
      this.notifyObservers('delete', value);
    }
    return bol;
  }

  clear(): void {
    this._set.clear();
  }

  get size(): number {
    return this._set.size;
  }

  keys(): IterableIterator<K> {
    return this._set.keys();
  }

  values(): IterableIterator<K> {
    return this._set.values();
  }

  entries(): IterableIterator<[K, K]> {
    return this._set.entries();
  }

  forEach(callbackfn: (value: K, value2: K, set: Set<K>) => void, thisArg?: any): void {
    this._set.forEach(callbackfn, thisArg);
  }
}
