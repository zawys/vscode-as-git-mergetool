import { runTest as runUnitTests } from "./unitTest.systemTest";
// TODO [2021-03-01] Disable the test which requires
// stable Code to be installed because of a packaging bug with Code.
// import { runTest as runUnstashConflictTest } from "./unstashConflict.systemTest";

export async function runTests(): Promise<boolean> {
  return await runUnitTests() /*|| (await unstashConflictTests.runTest())*/;
}
