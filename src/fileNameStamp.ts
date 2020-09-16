// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { createUIError, UIError } from "./uIError";

export function generateFileNameStamp(increment = 0): string {
  return (
    new Date().toISOString().replace(/[.:]/g, "-") +
    (increment === 0 ? "" : `-${increment}`)
  );
}

export async function generateFileNameStampUntil<
  T extends Exclude<unknown, false | UIError>
>(
  condition: (stamp: string) => Promise<T | false | UIError>
): Promise<T | UIError> {
  let increment = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const stamp = generateFileNameStamp(increment);
    const conditionResult = await condition(stamp);
    if (conditionResult !== false) {
      return conditionResult;
    }
    const newIncrement = increment + 1 + Math.floor(Math.random() * increment);
    if (newIncrement < increment) {
      return createUIError("Failed generating an available file stamp");
    }
    increment = newIncrement;
  }
}
