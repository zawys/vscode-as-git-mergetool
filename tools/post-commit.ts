import { existsSync, unlinkSync } from "fs";
import { asyncWhich, runAsync, runCommand } from "./util";

void runAsync(async () => {
  const git = await asyncWhich("git");

  if (existsSync(".precommit_stash_exists")) {
    unlinkSync(".precommit_stash_exists");

    // Based on: https://stackoverflow.com/a/19328859
    if (
      (await runCommand(git, [
        "cherry-pick",
        "-n",
        "-m1",
        "-Xtheirs",
        "stash",
      ])) !== 0
    ) {
      return 1;
    }
    if (
      (await runCommand(git, [
        "cherry-pick",
        "-n",
        "-m1",
        "-Xtheirs",
        "stash^3",
      ])) !== 0
    ) {
      return 1;
    }

    unlinkSync(".git/MERGE_MSG");
    if ((await runCommand(git, ["restore", "--staged", "."])) !== 0) {
      return 1;
    }
    if ((await runCommand(git, ["stash", "drop", "stash@{0}"])) !== 0) {
      return 1;
    }
  }

  return 0;
});
