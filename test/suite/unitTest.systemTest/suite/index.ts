// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { runMochaTests } from "../../../mochaTest";

export async function run(): Promise<void> {
  await runMochaTests(__dirname);
}
