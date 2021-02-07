// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as vscode from "vscode";

// The number in the file name is the PID of git-mergetool
export const parseBaseFileNameRE = /\/([^/]*)_(BASE|REMOTE|LOCAL)_(\d+(.*?))(\.git)?$/;

export function uRIOccursIn(
  diffedURIs: DiffedURIs,
  containedURI: vscode.Uri
): boolean {
  return fsPathOccursIn(diffedURIs, containedURI.fsPath);
}
export function fsPathOccursIn(
  diffedURIs: DiffedURIs,
  containedFsPath: string
): boolean {
  return toURIList(diffedURIs).some((diffedURI) => {
    const diffedPath = diffedURI.fsPath;
    return pathsRoughlyEqual(containedFsPath, diffedPath);
  });
}
export function toURIList(diffedURIs: DiffedURIs): vscode.Uri[] {
  const result = [
    diffedURIs.base,
    diffedURIs.local,
    diffedURIs.merged,
    diffedURIs.remote,
  ];
  if (diffedURIs.backup !== undefined) {
    result.push(diffedURIs.backup);
  }
  return result;
}
export function uRIsOrUndefEqual(
  first: vscode.Uri | undefined,
  second: vscode.Uri | undefined
): boolean {
  if (first === undefined) {
    return second === undefined;
  }
  if (second === undefined) {
    return false;
  }
  return uRIsEqual(first, second);
}
export function uRIsEqual(first: vscode.Uri, second: vscode.Uri): boolean {
  return pathsRoughlyEqual(first.fsPath, second.fsPath);
}
export function pathsRoughlyEqual(first: string, second: string): boolean {
  return (
    first === second || first + ".git" === second || first === second + ".git"
  );
}

export class DiffedURIs {
  public equals(other: DiffedURIs): boolean {
    return (
      uRIsEqual(this.base, other.base) &&
      uRIsEqual(this.local, other.local) &&
      uRIsEqual(this.remote, other.remote) &&
      uRIsEqual(this.merged, other.merged) &&
      uRIsOrUndefEqual(this.backup, other.backup)
    );
  }

  public equalsWithoutBackup(other: DiffedURIs): boolean {
    return (
      uRIsEqual(this.base, other.base) &&
      uRIsEqual(this.local, other.local) &&
      uRIsEqual(this.remote, other.remote) &&
      uRIsEqual(this.merged, other.merged)
    );
  }

  public constructor(
    public readonly base: vscode.Uri,
    public readonly local: vscode.Uri,
    public readonly remote: vscode.Uri,
    public readonly merged: vscode.Uri,
    public readonly backup?: vscode.Uri
  ) {}
}
