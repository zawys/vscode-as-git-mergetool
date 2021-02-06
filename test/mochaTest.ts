import path from "path";
import Mocha from "mocha";
import glob from "glob";

export function runMochaTests(
  testDirectory: string,
  timeout?: number
): Promise<void> {
  // Create the mocha test
  const debug = /--debug|--inspect/.test(
    [...process.argv, ...process.execArgv].join(" ")
  );
  const mocha = new Mocha({
    ui: "tdd",
    color: true,
    timeout: debug ? 0 : timeout,
  });

  const testsRoot = path.resolve(testDirectory, "..");

  return new Promise((resolve, reject) => {
    glob("**/**.test.js", { cwd: testsRoot }, (error, files) => {
      if (error) {
        return reject(error);
      }

      // Add files to the test suite
      for (const f of files) {
        mocha.addFile(path.resolve(testsRoot, f));
      }

      try {
        // Run the mocha test
        mocha.run((failures) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      } catch (error_) {
        console.error(error_);
        reject(error_);
      }
    });
  });
}
