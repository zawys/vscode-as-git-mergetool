// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { runSystemTest } from "../../systemTest";

export async function runTest(): Promise<boolean> {
  return await runSystemTest(__dirname, true);
}
