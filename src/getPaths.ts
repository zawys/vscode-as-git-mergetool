// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import which from "which";
import { createUIError, UIError } from "./uIError";

// This file is imported by the test runner and thus must not import `vscode`.

let gitPathPromise: Promise<string | UIError> | undefined;

export function getGitPath(): Promise<string | UIError> {
  if (gitPathPromise === undefined) {
    gitPathPromise = getGitPathInner();
  }
  return gitPathPromise;
}

export async function getGitPathInner(): Promise<string | UIError> {
  const whichResult = await whichPromise("git");
  if (whichResult === undefined) {
    return createUIError("Could not find Git binary.");
  }
  return whichResult;
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
