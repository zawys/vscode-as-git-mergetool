// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { createUIError, UIError } from "./uIError";
import { dirname } from "path";
import { execFilePromise } from "./childProcessHandy";
import { setContents } from "./fsHandy";

export async function gitMergeFile(
  gitPath: string,
  { base, local, remote, merged }: MergeFilePaths
): Promise<UIError | undefined> {
  const gitResult = await execFilePromise({
    filePath: gitPath,
    arguments_: ["merge-file", "--stdout", local, base, remote],
    options: {
      cwd: dirname(merged),
      timeout: 10000,
      windowsHide: true,
    },
  });
  const error = gitResult.error;
  if (
    error !== null &&
    (error.code === undefined || error.code < 0 || error.code > 127)
  ) {
    return createUIError(
      `Error when merging files by Git: ${gitResult.stderr}.`
    );
  }
  return setContents(merged, gitResult.stdout);
}

export interface MergeFilePaths {
  readonly base: string;
  readonly local: string;
  readonly remote: string;
  readonly merged: string;
}
