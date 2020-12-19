import { exit } from "process";
import which from "which";
import * as cp from "child_process";

export async function runCommand(
  command: string,
  arguments_: string[]
): Promise<number | null> {
  return await new Promise((resolve) => {
    console.log(`+${command} ${arguments_.join(" ")}`);
    const process = cp.spawn(command, arguments_, {
      stdio: "inherit",
    });
    process.on("exit", (code) => {
      resolve(code);
    });
  });
}

export function spawnAndCapture(
  file: string,
  arguments_: string[],
  options?: cp.SpawnOptions
): cp.SpawnSyncReturns<string> {
  console.log(`+${file} ${arguments_.join(" ")}`);
  const child = cp.spawnSync(file, arguments_, {
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
    which(command, (error, path) =>
      error
        ? reject(error)
        : path === undefined
        ? reject(new Error(`${command} was not found in PATH`))
        : resolve(path)
    );
  });
}

export async function runAsync(run: () => Promise<number>): Promise<void> {
  try {
    exit(await run());
  } catch (error) {
    console.error(error);
    exit(1);
  }
}
