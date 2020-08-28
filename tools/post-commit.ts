import * as fs from 'fs';
import { asyncWhich, runAsync, runCommand } from './util';

runAsync(async () => {
  const git = await asyncWhich("git");

  if (fs.existsSync(".precommit_stash_exists")) {
    fs.unlinkSync(".precommit_stash_exists");
    if (await runCommand(git, ["stash", "pop"]) !== 0) { return 1; }
  }

  return 0;
});
