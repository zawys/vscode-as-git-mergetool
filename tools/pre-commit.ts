import * as cp from 'child_process';
import { exit } from 'process';
import * as which from 'which';

async function run() {
  let result;

  const git = await asyncWhich("git");
  const yarn = await asyncWhich("yarn");

  result = await runCommand(yarn, ["run", "working_dir_is_clean"]);
  if (result === null) { return 1; }
  const stash = result !== 0;

  if (stash) {
    if (await runCommand(git, ["stash", "-ku"]) !== 0) { return 1; }
  }

  let error: boolean;
  while (true) {
    result = await runCommand(yarn, ["run", "test"]);
    if (result === null) { return 1; }
    if (result !== 0) { error = true; break; }

    result = await runCommand(yarn, ["run", "package"]);
    if (result === null) { return 1; }
    if (result !== 0) { error = true; break; }

    result = await runCommand(yarn, ["run", "working_dir_is_clean"]);
    if (result === null) { return 1; }
    if (result !== 0) { error = true; break; }

    error = false;
    break;
  }

  if (stash) {
    result = await runCommand(git, ["stash", "pop"]);
    if (result !== 0) { return 1; }
  }

  return error ? 1 : 0;
}

async function runCommand(
  command: string,
  args: string[],
): Promise<number | null> {
  return await new Promise(resolve => {
    console.log(`+${command} ${args.join(" ")}`);
    const process = cp.spawn(command, args, {
      stdio: 'inherit'
    });
    process.on("exit", (code) => {
      resolve(code);
    });
  });
}

function asyncWhich(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    which(command, (err, path) => err ? reject(err) : resolve(path));
  })
}

run().then(rc => {
  exit(rc);
}).catch(e => {
  throw new Error(e);
});
