import { exit } from "process";
import * as which from "which";
import * as cp from "child_process";

export async function runCommand(
  command: string,
  args: string[]
): Promise<number | null> {
  return await new Promise((resolve) => {
    console.log(`+${command} ${args.join(" ")}`);
    const process = cp.spawn(command, args, {
      stdio: "inherit",
    });
    process.on("exit", (code) => {
      resolve(code);
    });
  });
}

export function spawnAndCapture(
  file: string,
  args: string[],
  options?: cp.SpawnOptions
): cp.SpawnSyncReturns<string> {
  console.log(`+${file} ${args.join(" ")}`);
  const child = cp.spawnSync(file, args, {
    ...options,
    stdio: "pipe",
    encoding: "utf-8",
  });
  console.log(child.stdout);
  console.error(child.error);
  return child;
}

export function asyncWhich(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    which(command, (err, path) => (err ? reject(err) : resolve(path)));
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
