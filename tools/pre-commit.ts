// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as fs from "fs";
import { asyncWhich, runAsync, runCommand } from "./util";

void runAsync(async () => {
  const git = await asyncWhich("git");
  const yarn = await asyncWhich("yarn");

  const result = await runCommand(yarn, ["run", "working_dir_is_clean"]);
  if (result === null) {
    return 1;
  }
  const stash = result !== 0;

  if (stash) {
    if ((await runCommand(git, ["stash", "-ku"])) !== 0) {
      return 1;
    }

    fs.appendFileSync(".precommit_stash_exists", "");
  }

  if ((await runCommand(yarn, ["run", "test"])) !== 0) {
    return 1;
  }
  if ((await runCommand(yarn, ["run", "package"])) !== 0) {
    return 1;
  }
  if ((await runCommand(yarn, ["run", "working_dir_is_clean"])) !== 0) {
    return 1;
  }

  return 0;
});
