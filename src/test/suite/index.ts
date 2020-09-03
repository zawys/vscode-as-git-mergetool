import * as unitTests from "./unitTest.systemTest";
// import * as unstashConflictTests from "./unstashConflict.systemTest";

export async function runTests(): Promise<boolean> {
  return await unitTests.runTest() /*|| (await unstashConflictTests.runTest())*/;
}
