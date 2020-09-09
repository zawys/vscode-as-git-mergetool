// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as vscode from "vscode";
import { GitExtension } from "./@types/git";
import { getGitPath } from "./getPaths";
import { UIError } from "./uIError";

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
let vSCGitPathPromise: Promise<string | UIError> | undefined;
export function getVSCGitPath(): Promise<string | UIError> {
  if (vSCGitPathPromise === undefined) {
    vSCGitPathPromise = getVSCGitPathInner();
  }
  return vSCGitPathPromise;
}
async function getVSCGitPathInner(): Promise<string | UIError> {
  const gitExtension = await vscode.extensions
    .getExtension<GitExtension>("vscode.git")
    ?.activate();
  if (gitExtension !== undefined) {
    if (gitExtension.enabled) {
      const api = gitExtension.getAPI(1);
      return api.git.path;
    }
  }
  return await getGitPath();
}
export async function getVSCGitPathInteractively(): Promise<
  string | undefined
> {
  const gitPath = await getVSCGitPath();
  if (typeof gitPath === "string") {
    return gitPath;
  }
  void vscode.window.showErrorMessage(gitPath.message);
  return undefined;
}
