import * as vscode from "vscode";
import {
  getGitPathInteractively,
  getWorkingDirectoryUriInteractively,
} from "./getPaths";

export async function createBackgroundGitTerminal(
  terminalOptions: vscode.TerminalOptions
): Promise<vscode.Terminal | undefined> {
  const gitPath = await getGitPathInteractively();
  if (gitPath === undefined) {
    return;
  }
  const workingDirectory = getWorkingDirectoryUriInteractively();
  if (workingDirectory === undefined) {
    return;
  }
  const term = vscode.window.createTerminal({
    name: ["git", ...(terminalOptions.shellArgs || [])].join(" "),
    cwd: workingDirectory,
    shellPath: gitPath,
    ...terminalOptions,
  });
  if (term === undefined) {
    void vscode.window.showErrorMessage("Failed to create a terminal.");
    return;
  }
  return term;
}
