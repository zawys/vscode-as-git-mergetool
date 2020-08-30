import * as vscode from "vscode";
import * as which from "which";

const pathSeparator = "/";
function uriStartsWith(parent: vscode.Uri, child: vscode.Uri): boolean {
  if (parent.authority !== child.authority) {
    return false;
  }
  const childParts = child.path.split(pathSeparator);
  const parentParts = parent.path.split(pathSeparator);
  for (const [i, parentPart] of parentParts.entries()) {
    if (parentPart !== childParts[i]) {
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
let gitPathPromise: Promise<string | undefined> | undefined;

export function getGitPath(): Promise<string | undefined> {
  if (gitPathPromise === undefined) {
    gitPathPromise = new Promise<string | undefined>((resolve, reject) => {
      which("git", (error, path) => {
        if (error) {
          reject(error);
        } else {
          resolve(path);
        }
      });
    });
  }
  return gitPathPromise;
}

export async function getGitPathInteractively(): Promise<string | undefined> {
  const gitPath = await getGitPath();
  if (gitPath) {
    return gitPath;
  }
  void vscode.window.showErrorMessage("Could not find path to git binary.");
  return undefined;
}
