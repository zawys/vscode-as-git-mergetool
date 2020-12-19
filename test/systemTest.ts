// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import path from "path";
import { runTests } from "vscode-test";
import * as cp from "child_process";
import * as fs from "fs";
import { whichPromise } from "../src/getPaths";

/**
 *
 * @param testDirectory directory containing `environment.zip` and `suite`
 */
export async function runSystemTest(
  testDirectory: string,
  noWorkspace = false
): Promise<boolean> {
  // The folder containing the Extension Manifest package.json
  // Passed to `--extensionDevelopmentPath`.
  // Relative to the location of the compiled files (`out/test`)
  const extensionDevelopmentPath = path.resolve(__dirname, "../../");
  // The path to test runner
  // Passed to --extensionTestsPath
  const extensionTestsPath = path.resolve(testDirectory, "./suite/index");

  const launchArguments = ["--new-window", "--disable-extensions"];
  if (!noWorkspace) {
    const zipPath = path.resolve(testDirectory, "environment.zip");
    const filesPath = await unpackToTemporaryDirectory(zipPath);
    launchArguments.push(path.resolve(filesPath, "workspace"));
  }
  const debugTestFilePath = process.env["DEBUG_CURRENT_FILE_PATH"];
  let debugging = false;
  if (debugTestFilePath !== undefined) {
    const testName = (/[^/\\]+$/.exec(
      path.relative(extensionDevelopmentPath, testDirectory)
    ) || [undefined])[0];
    if (
      testName !== undefined &&
      path
        .relative(extensionDevelopmentPath, debugTestFilePath)
        .split(path.sep)
        .includes(testName)
    ) {
      const port = 3714;
      // VS Code waits with debugging until this line appears.
      // See `tasks.json`.
      console.log(
        `Debugging test ${debugTestFilePath}. Waiting on port ${port}.`
      );
      launchArguments.push(`--inspect-brk-extensions=${port}`);
      debugging = true;
    } else {
      console.log(`extensionTestsPath: ${extensionTestsPath}`);
      console.log(`testName: ${testName || "undefined"}`);
      console.log(`debugTestFilePath: ${debugTestFilePath}`);
      console.log("-> skipping");
      return false;
    }
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
    console.error(`Failed to run tests in ${testDirectory}`);
    throw error;
  }
  return debugging;
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
  const temporaryDirectoryPath = cp
    .spawnSync(await mktemp, ["-d"], {
      encoding: "utf-8",
    })
    .stdout.trimEnd();
  console.log(`unzipped at: ${temporaryDirectoryPath}`);
  cp.execFileSync(await unzip, [zipPath, "-d", temporaryDirectoryPath]);
  return temporaryDirectoryPath;
}

export function deleteTemporaryDirectory(path: string): void {
  fs.unlinkSync(path);
}

export function isContainedIn(
  parentPath: string,
  comparedPath: string
): boolean {
  const relative = path.relative(parentPath, comparedPath);
  console.log(`relative: ${relative}`);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}
