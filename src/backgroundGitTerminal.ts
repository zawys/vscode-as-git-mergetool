import * as vscode from 'vscode';
import { getGitPath, getGitPathInteractively, getWorkingDirectoryUri } from "./getPaths";

export async function createBackgroundGitTerminal(
  terminalOptions: vscode.TerminalOptions
): Promise<vscode.Terminal | undefined> {
  const workingDir = getWorkingDirectoryUri();
  if (workingDir === undefined) {
    vscode.window.showErrorMessage(
      "You need need to have a workspace opened."
    );
    return;
  }
  const gitPath = await getGitPathInteractively();
  if (!gitPath) { return; }
  const term = vscode.window.createTerminal({
    name: ["git", ...(terminalOptions.shellArgs || [])].join(" "),
    cwd: workingDir,
    shellPath: gitPath,
    ...terminalOptions
  });
  if (term === undefined) {
    vscode.window.showErrorMessage("Failed to create a terminal.");
    return;
  }
  return term;
}
