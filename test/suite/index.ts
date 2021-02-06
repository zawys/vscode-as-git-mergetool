import * as unitTests from "./unitTest.systemTest";
// TODO [2021-03-01] Disable the test which requires
// stable Code to be installed because of a packaging bug with Code.
// import * as unstashConflictTests from "./unstashConflict.systemTest";

export async function runTests(): Promise<boolean> {
  return await unitTests.runTest() /*|| (await unstashConflictTests.runTest())*/;
}
