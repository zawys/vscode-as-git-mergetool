import { exit } from "process";
import * as which from 'which';
import * as cp from 'child_process';

export async function runCommand(
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

export function asyncWhich(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    which(command, (err, path) => err ? reject(err) : resolve(path));
  });
}

export async function runAsync(run: () => Promise<number>) {
  try {
    exit(await run());
  } catch (e) {
    console.error(e);
    exit(1);
  }
}
