import * as vscode from "vscode";
import { GitExtension } from "./@types/git";
import { getGitPath } from "./getPaths";

const pathSeparator = "/";
function uriStartsWith(parent: vscode.Uri, child: vscode.Uri): boolean {
  if (parent.authority !== child.authority) {
    return false;
  }
  const childParts = child.path.split(pathSeparator);
  const parentParts = parent.path.split(pathSeparator);
  for (const [index, parentPart] of parentParts.entries()) {
    if (parentPart !== childParts[index]) {
      return false;
    }
  }
  return true;
}

export function getWorkingDirectoryUri(): vscode.Uri | undefined {
  if (vscode.window.activeTextEditor !== undefined) {
    const textEditorUri = vscode.window.activeTextEditor.document.uri;
    for (const folder of vscode.workspace.workspaceFolders || []) {
      if (uriStartsWith(folder.uri, textEditorUri)) {
        return folder.uri;
      }
    }
  }
  if (
    vscode.workspace.workspaceFolders === undefined ||
    vscode.workspace.workspaceFolders.length !== 1
  ) {
    return undefined;
  }
  return vscode.workspace.workspaceFolders[0].uri;
}

export function getWorkingDirectoryUriInteractively(): vscode.Uri | undefined {
  const result = getWorkingDirectoryUri();
  if (result === undefined) {
    void vscode.window.showErrorMessage(
      "You need need to have exactly one workspace opened."
    );
  }
  return result;
}
let vSCGitPathPromise: Promise<string | undefined> | undefined;
export function getVSCGitPath(): Promise<string | undefined> {
  if (vSCGitPathPromise === undefined) {
    vSCGitPathPromise = getVSCGitPathInner();
  }
  return vSCGitPathPromise;
}
async function getVSCGitPathInner(): Promise<string | undefined> {
  const gitExtension = await vscode.extensions
    .getExtension<GitExtension>("vscode.git")
    ?.activate();
  if (gitExtension !== undefined && gitExtension.enabled) {
    const api = gitExtension.getAPI(1);
    return api.git.path;
  }
  return await getGitPath();
}
export async function getVSCGitPathInteractively(): Promise<
  string | undefined
> {
  const gitPath = await getVSCGitPath();
  if (gitPath) {
    return gitPath;
  }
  void vscode.window.showErrorMessage("Could not find Git binary.");
  return undefined;
}
