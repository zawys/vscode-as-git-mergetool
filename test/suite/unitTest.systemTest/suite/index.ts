import { runMochaTests } from "../../../mochaTest";

export async function run(): Promise<void> {
  await runMochaTests(__dirname);
}
