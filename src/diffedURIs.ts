import * as vscode from 'vscode';
import { getStats } from './fsAsync';
import * as fs from 'fs';

export function getDiffedURIs(baseURI: vscode.Uri): DiffedURIs | undefined {
  const parseResult = parseBaseFileNameRE.exec(baseURI.path);
  if (parseResult === null) {
    return undefined;
  }
  const baseFileName = parseResult[1];
  const restWOGit = parseResult[3];
  const extension = parseResult[4];
  function joinBasePath(parts: string[]) {
    return vscode.Uri.joinPath(baseURI, parts.join(""))
      .with({ scheme: "file" });
  }
  return new DiffedURIs(
    joinBasePath(["../", baseFileName, "_BASE_", restWOGit]),
    joinBasePath(["../", baseFileName, "_LOCAL_", restWOGit]),
    joinBasePath(["../", baseFileName, "_REMOTE_", restWOGit]),
    joinBasePath(["../", baseFileName, extension]),
    joinBasePath(["../", baseFileName, "_BACKUP_", restWOGit]),
  );
}

export const parseBaseFileNameRE =
  /\/([^\/]*)_(BASE|REMOTE|LOCAL)_([0-9]{1,6}(.*?))(\.git)?$/;

export function asURIList(uRIs: DiffedURIs): vscode.Uri[] {
  const result = [uRIs.base, uRIs.local, uRIs.merged, uRIs.remote];
  if (uRIs.backup !== undefined) { result.push(uRIs.backup); }
  return result;
}
export function uRIsOrUndefEqual(
  first: vscode.Uri | undefined,
  second: vscode.Uri | undefined
): boolean {
  if (first === undefined) { return second === undefined; }
  if (second === undefined) { return false; }
  return uRIsEqual(first, second);
}
export function uRIsEqual(first: vscode.Uri, second: vscode.Uri): boolean {
  return pathsRoughlyEqual(first.path, second.path);
}
export function pathsRoughlyEqual(first: string, second: string): boolean {
  return first === second ||
    first + ".git" === second ||
    first === second + ".git";
}
export async function filesExist(diffedURIs: DiffedURIs): Promise<boolean> {
  return (await Promise.all(
    asURIList(diffedURIs).map(async uRI => {
      if (uRI.fsPath.endsWith(".git")) {
        vscode.window.showErrorMessage("path ends with .git");
      }
      const stats = await getStats(uRI.fsPath);
      if (stats === undefined) { return false; }
      return stats.isFile();
    })
  )).every(exists => exists);
}

export class DiffedURIs {
  public equals(other: DiffedURIs) {
    return (
      uRIsEqual(this.base, other.base) &&
      uRIsEqual(this.local, other.local) &&
      uRIsEqual(this.remote, other.remote) &&
      uRIsEqual(this.merged, other.merged) &&
      uRIsOrUndefEqual(this.backup, other.backup)
    );
  }

  public equalsWithoutBackup(other: DiffedURIs) {
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
    public readonly backup?: vscode.Uri,
  ) { }
}
