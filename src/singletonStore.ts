// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

export class SingletonStore<T> {
  get value(): T {
    if (this._context === undefined) {
      throw new Error("get");
    }
    return this._context;
  }
  set value(value: T) {
    if (this._context !== undefined) {
      throw new Error("set");
    }
    this._context = value;
  }

  private _context: T | undefined;
}
