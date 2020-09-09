// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as unitTests from "./unitTest.systemTest";
import * as unstashConflictTests from "./unstashConflict.systemTest";

export async function runTests(): Promise<boolean> {
  return (await unitTests.runTest()) || (await unstashConflictTests.runTest());
}
