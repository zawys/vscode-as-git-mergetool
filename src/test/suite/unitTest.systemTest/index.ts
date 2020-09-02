import { runSystemTest } from "../../systemTest";

export async function runTest(): Promise<void> {
  await runSystemTest(__dirname, true);
}
