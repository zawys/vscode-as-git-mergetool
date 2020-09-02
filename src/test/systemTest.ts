import * as path from "path";
import { runTests } from "vscode-test";
import * as cp from "child_process";
import * as fs from "fs";
import { whichPromise } from "../getPaths";

/**
 *
 * @param testDirectoryPath directory containing `environment.zip` and `suite`
 */
export async function runSystemTest(
  testDirectoryPath: string,
  noWorkspace = false
): Promise<void> {
  // The folder containing the Extension Manifest package.json
  // Passed to `--extensionDevelopmentPath`.
  // Relative to the location of the compiled files (`out/src/test`)
  const extensionDevelopmentPath = path.resolve(__dirname, "../../../");
  console.log(`extensionDevelopmentPath: ${extensionDevelopmentPath}`);
  // The path to test runner
  // Passed to --extensionTestsPath
  const extensionTestsPath = path.resolve(testDirectoryPath, "./suite/index");

  const launchArguments = ["--new-window", "--disable-extensions"];
  if (!noWorkspace) {
    const zipPath = path.resolve(testDirectoryPath, "environment.zip");
    const filesPath = await unpackToTemporaryDirectory(zipPath);
    launchArguments.push(path.resolve(filesPath, "workspace"));
  }

  try {
    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: launchArguments,
      extensionTestsEnv: {
        ...process.env,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ELECTRON_RUN_AS_NODE: undefined,
      },
      vscodeExecutablePath: process.env["stable_code_path"],
    });
  } catch (error) {
    console.error(`Failed to run tests in ${testDirectoryPath}`);
    throw error;
  }
}

export function unwrap<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error("value was undefined");
  }
  return value;
}

export async function unwrappedWhich(executableName: string): Promise<string> {
  return unwrap(await whichPromise(executableName));
}

const mktemp = unwrappedWhich("mktemp");
const unzip = unwrappedWhich("unzip");

/**
 *
 * @param zipPath absolute path to ZIP file containing the repository.
 * @returns path to the unpacked temporary directory.
 */
export async function unpackToTemporaryDirectory(
  zipPath: string
): Promise<string> {
  const temporaryDirectoryPath = cp.spawnSync(await mktemp, ["-d"], {
    encoding: "utf-8",
  }).stdout;
  console.log(`unzipped at: ${temporaryDirectoryPath}`);
  cp.execFileSync(await unzip, [zipPath, "-d", temporaryDirectoryPath]);
  return temporaryDirectoryPath;
}

export function deleteTemporaryDirectory(path: string): void {
  fs.unlinkSync(path);
}
