// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { config as dotenvConfig } from "dotenv";
import { runTests } from "./suite";

dotenvConfig();

export async function main(): Promise<void> {
  try {
    await runTests();
  } catch (error) {
    console.error(error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
}

void main();
