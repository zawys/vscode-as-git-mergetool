import * as cp from "child_process";
import { window } from "vscode";
export function execFilePromise({
  filePath,
  arguments_,
  options,
}: ExecFileArguments): Promise<ExecFileResult> {
  return new Promise<ExecFileResult>((resolve) =>
    cp.execFile(filePath, arguments_, options || {}, (error, stdout, stderr) =>
      resolve({ error, stdout, stderr })
    )
  );
}

export async function execFileStdout(
  arguments_: ExecFileArguments
): Promise<string | ExecFileResult> {
  const result = await execFilePromise(arguments_);
  return result.error === null ? result.stdout : result;
}

export async function execFileStdoutInteractively(
  arguments_: ExecFileArguments
): Promise<string | undefined> {
  const result = await execFilePromise(arguments_);
  if (result.error === null) {
    return result.stdout;
  }
  const command = [arguments_.filePath, ...(arguments_.arguments_ || [])].join(
    ""
  );
  void window.showErrorMessage(
    `Could not execute command \`${command}\`: ${formatExecFileError(result)}`
  );
  return undefined;
}

const maxOutputEllipsisLength = 160; // two full 80-character terminal lines
const startPartLength = Math.floor(maxOutputEllipsisLength / 2);
const endPartLength = maxOutputEllipsisLength - startPartLength - 1;
function commandOutputEllipsis(output: string): string {
  if (output.length <= maxOutputEllipsisLength) {
    return output;
  }
  return `${output.slice(0, endPartLength)}…${output.slice(
    output.length - endPartLength
  )}`;
}

export function formatExecFileError(result: ExecFileResult): string {
  if (result.error === null) {
    return "unknown";
  }
  return `${result.error.name}: ${result.error.message}. \nExit code: ${
    result.error.code || "unknown"
  }; Signal: ${result.error.signal || "unknown"}. \nStdout: ${
    result.stdout ? "\n" : ""
  }${commandOutputEllipsis(result.stdout) || "none"}\nStderr: ${
    result.error ? "\n" : ""
  }${commandOutputEllipsis(result.stderr) || "none"}`;
}

export async function execFileStdoutTrimEOL(
  arguments_: ExecFileArguments
): Promise<string | ExecFileResult> {
  const result = await execFileStdout(arguments_);
  return typeof result !== "string" ? result : trimLastEOL(result);
}

export async function execFileStdoutInteractivelyTrimEOL(
  arguments_: ExecFileArguments
): Promise<string | undefined> {
  const result = await execFileStdoutInteractively(arguments_);
  return result === undefined ? undefined : trimLastEOL(result);
}

function trimLastEOL(value: string): string {
  const lastIndex = value.length - 1;
  if (lastIndex < 0) {
    return value;
  }
  return value[lastIndex] === "\n" ? value.slice(0, lastIndex) : value;
}

export interface ExecFileArguments {
  filePath: string;
  arguments_?: string[];
  options?: cp.ExecFileOptions;
}
export interface ExecFileResult {
  error: cp.ExecException | null;
  stdout: string;
  stderr: string;
}
