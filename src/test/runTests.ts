import * as dotenv from "dotenv";
import * as systemTests from "./suite";
import * as process from "process";

dotenv.config();

export async function main(): Promise<void> {
  try {
    await systemTests.runTests();
  } catch (error) {
    console.error(error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
}

void main();