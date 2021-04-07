import { extensions, Uri, window, workspace } from "vscode";
import { GitExtension } from "./@types/git";
import { getGitPath } from "./getPaths";

const pathSeparator = "/";
function uriStartsWith(parent: Uri, child: Uri): boolean {
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

export function getWorkspaceDirectoryUri(): Uri | undefined {
  if (window.activeTextEditor !== undefined) {
    const textEditorUri = window.activeTextEditor.document.uri;
    for (const folder of workspace.workspaceFolders || []) {
      if (uriStartsWith(folder.uri, textEditorUri)) {
        return folder.uri;
      }
    }
  }
  if (
    workspace.workspaceFolders === undefined ||
    workspace.workspaceFolders.length !== 1
  ) {
    return undefined;
  }
  return workspace.workspaceFolders[0].uri;
}

export function getWorkspaceDirectoryUriInteractively(): Uri | undefined {
  const result = getWorkspaceDirectoryUri();
  if (result === undefined) {
    void window.showErrorMessage(
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
  const gitExtension = await extensions
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
  void window.showErrorMessage("Could not find Git binary.");
  return undefined;
}
