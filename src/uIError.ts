// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

export const uIErrorTypeName = "UIError";
export interface UIError {
  readonly typeName: typeof uIErrorTypeName;
  readonly message: string;
}
export function isUIError(x: unknown): x is UIError {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { [k in "typeName"]?: unknown }).typeName === uIErrorTypeName
  );
}
export function createUIError(message: string): UIError {
  return { typeName: uIErrorTypeName, message };
}
