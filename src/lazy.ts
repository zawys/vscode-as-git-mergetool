export class Lazy<T> {
  public get value(): T {
    if (!this.initialized) {
      this._value = this.factory();
      this.initialized = true;
    }
    return this._value as T;
  }

  public constructor(private readonly factory: () => T) {}

  private initialized = false;
  private _value: T | undefined;
}
