import { runTest as runUnitTests } from "./unitTest.systemTest";
// TODO [2021-05-01] Rewrite unstashConflictTests for the main branch.
// import { runTest as runUnstashConflictTest } from "./unstashConflict.systemTest";

export async function runTests(): Promise<boolean> {
  return await runUnitTests() /*|| (await unstashConflictTests.runTest())*/;
}
