import * as vscode from 'vscode';

export class SingletonStore<T> {
  get value(): T {
    if (this._context === undefined) { throw new Error("get"); }
    return this._context;
  }
  set value(value: T) {
    if (this._context !== undefined) { throw new Error("set"); }
    this._context = value;
  }

  private _context: T | undefined;
}

export const defaultExtensionContextManager =
  new SingletonStore<vscode.ExtensionContext>();
