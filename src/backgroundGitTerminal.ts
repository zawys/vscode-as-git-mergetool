import { Terminal, TerminalOptions, window } from "vscode";
import {
  getVSCGitPathInteractively,
  getWorkingDirectoryUriInteractively,
} from "./getPathsWithinVSCode";

export async function createBackgroundGitTerminal(
  terminalOptions: TerminalOptions
): Promise<Terminal | undefined> {
  const gitPath = await getVSCGitPathInteractively();
  if (gitPath === undefined) {
    return;
  }
  const workingDirectory = getWorkingDirectoryUriInteractively();
  if (workingDirectory === undefined) {
    return;
  }
  const term = window.createTerminal({
    name: ["git", ...(terminalOptions.shellArgs || [])].join(" "),
    cwd: workingDirectory,
    shellPath: gitPath,
    ...terminalOptions,
  });
  if (term === undefined) {
    void window.showErrorMessage("Failed to create a terminal.");
    return;
  }
  return term;
}
