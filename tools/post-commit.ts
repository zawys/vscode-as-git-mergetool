import * as fs from "fs";
import { asyncWhich, runAsync, runCommand } from "./util";

runAsync(async () => {
  const git = await asyncWhich("git");

  if (fs.existsSync(".precommit_stash_exists")) {
    fs.unlinkSync(".precommit_stash_exists");

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

    fs.unlinkSync(".git/MERGE_MSG");
    if ((await runCommand(git, ["restore", "--staged", "."])) !== 0) {
      return 1;
    }
    if ((await runCommand(git, ["stash", "drop", "stash@{0}"])) !== 0) {
      return 1;
    }
  }

  return 0;
});
