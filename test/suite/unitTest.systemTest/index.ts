import { runSystemTest } from "../../systemTest";

export async function runTest(): Promise<boolean> {
  return await runSystemTest(__dirname, true);
}
