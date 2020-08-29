import * as vscode from "vscode";
import { getGitPathInteractively, getWorkingDirectoryUri } from "./getPaths";

export async function createBackgroundGitTerminal(
  terminalOptions: vscode.TerminalOptions
): Promise<vscode.Terminal | undefined> {
  const workingDirectory = getWorkingDirectoryUri();
  if (workingDirectory === undefined) {
    void vscode.window.showErrorMessage(
      "You need need to have a workspace opened."
    );
    return;
  }
  const gitPath = await getGitPathInteractively();
  if (!gitPath) {
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
