// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { runTest as runUnitTests } from "./unitTest.systemTest";
// TODO [2021-05-01] Rewrite unstashConflictTests for the main branch.
// import { runTest as runUnstashConflictTest } from "./unstashConflict.systemTest";

export async function runTests(): Promise<boolean> {
  return await runUnitTests();
}
