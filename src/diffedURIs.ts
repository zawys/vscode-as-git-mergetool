import { Uri, window } from "vscode";
import { getStats } from "./fsHandy";
import { readonlyScheme } from "./readonlyDocumentProvider";

export function getDiffedURIs(baseURI: Uri): DiffedURIs | undefined {
  const parseResult = parseBaseFileNameRE.exec(baseURI.path);
  if (parseResult === null) {
    return undefined;
  }
  const baseFileName = parseResult[1];
  const restWOGit = parseResult[3];
  const extension = parseResult[4];
  function joinBasePath(parts: string[], scheme: string) {
    return Uri.joinPath(baseURI, parts.join("")).with({
      scheme,
    });
  }
  return new DiffedURIs(
    joinBasePath(["../", baseFileName, "_BASE_", restWOGit], readonlyScheme),
    joinBasePath(["../", baseFileName, "_LOCAL_", restWOGit], readonlyScheme),
    joinBasePath(["../", baseFileName, "_REMOTE_", restWOGit], readonlyScheme),
    joinBasePath(["../", baseFileName, extension], "file"),
    joinBasePath(["../", baseFileName, "_BACKUP_", restWOGit], readonlyScheme)
  );
}

// The number in the file name is the PID of git-mergetool
export const parseBaseFileNameRE = /\/([^/]*)_(BASE|REMOTE|LOCAL)_(\d+(.*?))(\.git)?$/;

export function asURIList(uRIs: DiffedURIs): Uri[] {
  const result = [uRIs.base, uRIs.local, uRIs.merged, uRIs.remote];
  if (uRIs.backup !== undefined) {
    result.push(uRIs.backup);
  }
  return result;
}
export function uRIsOrUndefEqual(
  first: Uri | undefined,
  second: Uri | undefined
): boolean {
  if (first === undefined) {
    return second === undefined;
  }
  if (second === undefined) {
    return false;
  }
  return uRIsEqual(first, second);
}
export function uRIsEqual(first: Uri, second: Uri): boolean {
  return pathsRoughlyEqual(first.path, second.path);
}
export function pathsRoughlyEqual(first: string, second: string): boolean {
  return (
    first === second || first + ".git" === second || first === second + ".git"
  );
}
export async function filesExist(diffedURIs: DiffedURIs): Promise<boolean> {
  return (
    await Promise.all(
      asURIList(diffedURIs).map(async (uRI) => {
        if (uRI.fsPath.endsWith(".git")) {
          void window.showErrorMessage("path ends with .git");
        }
        const stats = await getStats(uRI.fsPath);
        if (stats === undefined) {
          return false;
        }
        return stats.isFile();
      })
    )
  ).every((exists) => exists);
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
    public readonly base: Uri,
    public readonly local: Uri,
    public readonly remote: Uri,
    public readonly merged: Uri,
    public readonly backup?: Uri
  ) {}
}
