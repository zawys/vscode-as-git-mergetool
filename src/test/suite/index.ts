import * as unitTests from "./unitTest.systemTest";

export async function runTests(): Promise<void> {
  await unitTests.runTest();
  // const files = await new Promise<string[]>((resolve, reject) => {
  //   glob("*.systemTest/runTest.ts", { cwd: __dirname }, (error, files) => {
  //     if (error) {
  //       console.error(
  //         `Error using glob:\n${error.name}\n${error.message}\n${
  //           error.stack || ""
  //         }`
  //       );
  //       reject(error);
  //     } else {
  //       resolve(files);
  //     }
  //   });
  // });
  // for (const file of files) {
  //   try {
  //     // eslint-disable-next-line @typescript-eslint/no-var-requires,@typescript-eslint/no-unsafe-assignment
  //     const test = require(file);
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  //     await test.runTest();
  //   } catch (error_) {
  //     console.error(error_);
  //     throw error_;
  //   }
  // }
}
