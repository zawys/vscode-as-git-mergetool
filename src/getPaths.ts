import * as vscode from 'vscode';
import * as which from 'which';

const pathSep = "/";
function uriStartsWith(parent: vscode.Uri, child: vscode.Uri): boolean {
  if (parent.authority !== child.authority) {
    return false;
  }
  const childParts = child.path.split(pathSep);
  const parentParts = parent.path.split(pathSep);
  for (let i = 0; i < parentParts.length; i++) {
    if (parentParts[i] !== childParts[i]) {
      return false;
    }
  }
  return true;
}

export function getWorkingDirectoryUri(): vscode.Uri | undefined {
  if (vscode.window.activeTextEditor !== undefined) {
    const textEditorUri = vscode.window.activeTextEditor.document.uri;
    for (const folder of (vscode.workspace.workspaceFolders || [])) {
      if (uriStartsWith(folder.uri, textEditorUri)) {
        return folder.uri;
      }
    }
  }
  if ((vscode.workspace.workspaceFolders?.length || 0) === 0) {
    return undefined;
  }
  return vscode.workspace.workspaceFolders![0].uri;
}

let gitPathPromise: Promise<string | undefined> | undefined;

export function getGitPath(): Promise<string | undefined> {
  if (gitPathPromise === undefined) {
    gitPathPromise = new Promise<string | undefined>(
      (resolve, reject) => {
        which("git", (error, path) => {
          if (error) { reject(error); }
          else { resolve(path); }
        });
      }
    );
  }
  return gitPathPromise;
}

export async function getGitPathInteractively(): Promise<string | undefined> {
  const gitPath = await getGitPath();
  if (gitPath) { return gitPath; }
  vscode.window.showErrorMessage("Could not find path to git binary.");
  return undefined;
}
