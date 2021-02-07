// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

export const mergeConflictIndicatorRE = /^(>{7}|<{7}|\|{7}|={7})/m;

export function containsMergeConflictIndicators(text: string): boolean {
  return mergeConflictIndicatorRE.test(text);
}
