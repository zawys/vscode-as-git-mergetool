/* eslint-disable unicorn/no-process-exit */
import * as path from "path";
import * as process from "process";
import * as dotenv from "dotenv";
import { runTests } from "vscode-test";

dotenv.config();

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../../");

    // The path to test runner
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ["--disable-extensions"],
      extensionTestsEnv: {
        ...process.env,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ELECTRON_RUN_AS_NODE: undefined,
      },
      vscodeExecutablePath: process.env["stable_code_path"],
    });
  } catch {
    console.error("Failed to run tests");
    process.exit(1);
  }
}

void main();
/* eslint-enable unicorn/no-process-exit */
