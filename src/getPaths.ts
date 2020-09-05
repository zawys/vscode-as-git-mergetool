import * as which from "which";

// This file is imported by the test runner and thus must not import `vscode`.

let gitPathPromise: Promise<string | undefined> | undefined;

export function getGitPath(): Promise<string | undefined> {
  if (gitPathPromise === undefined) {
    gitPathPromise = whichPromise("git");
  }
  return gitPathPromise;
}

export function whichPromise(
  executableName: string
): Promise<string | undefined> {
  return new Promise<string | undefined>((resolve, reject) => {
    which(executableName, (error, path) => {
      if (error) {
        reject(error);
      } else {
        resolve(path);
      }
    });
  });
}
