// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { dirname, relative, resolve, resolve as resolvePath } from "path";
import {
  execFileStdoutInteractivelyTrimEOL,
  execFileStdoutTrimEOL,
  formatExecFileError,
} from "./childProcessHandy";
import { FileType, getFileType } from "./fsHandy";
import { getVSCGitPath } from "./getPathsWithinVSCode";
import { createUIError, isUIError, UIError } from "./uIError";

/**
 * Several approaches copied from git-mergetool which is under GPLv2.
 */
export class GitMergetoolReplacement {
  public async analyzeConflictSituation(
    conflictPath: string
  ): Promise<MergeConflictSituation | MergeNotApplicableResult | UIError> {
    const cwd = dirname(conflictPath);
    const filePath = relative(cwd, conflictPath);
    const absoluteVersionPath = resolvePath(filePath);
    const gitPath = await getVSCGitPath();
    if (typeof gitPath !== "string") {
      return gitPath;
    }
    const lsFilesResult = await execFileStdoutTrimEOL({
      filePath: gitPath,
      arguments_: ["ls-files", "-u", "--", filePath],
      options: { cwd },
    });
    if (typeof lsFilesResult !== "string") {
      return createUIError(
        `git ls-files threw: ${formatExecFileError(lsFilesResult)}`
      );
    }
    if (lsFilesResult === "") {
      const fileType = await getFileType(resolvePath(conflictPath));
      return fileType === FileType.notExisting
        ? fileNotFoundResult
        : noMergeRequiredResult;
    }
    const versions: { [k in VersionName]?: VCSEntry } = {};
    const stageVersionNameMap: { [stage: string]: VersionName | undefined } = {
      "1": "base",
      "2": "local",
      "3": "remote",
    };
    for (const entry of lsFilesResult.split("\n")) {
      const match = GitMergetoolReplacement.lsFilesURE.exec(entry);
      if (match === null || match.groups === undefined) {
        return createUIError("Could not parse output of git ls-files");
      }
      const {
        mode,
        object,
        stage,
        path,
      }: { [k: string]: string | undefined } = match.groups;
      if (!mode || !object || !stage) {
        return createUIError("Could not parse output of git ls-files");
      }
      const versionName = stageVersionNameMap[stage];
      if (versionName === undefined) {
        return createUIError("Unexpected output of ls-files");
      }
      const analysisResult = this.analyzeVCSEntry({
        mode,
        object,
        absPath: resolve(cwd, path),
      });
      if (isUIError(analysisResult)) {
        return analysisResult;
      }
      versions[versionName] = analysisResult;
    }
    for (const versionName of versionNames) {
      if (versions[versionName] === undefined) {
        const analysisResult = await this.analyzeNotExistingVCSEntry(
          gitPath,
          cwd,
          absoluteVersionPath
        );
        if (isUIError(analysisResult)) {
          return analysisResult;
        }
        versions[versionName] = analysisResult;
      }
    }
    return versions as MergeConflictSituation;
  }
  private async analyzeNotExistingVCSEntry(
    gitPath: string,
    cwd: string,
    absoluteVersionPath: string
  ): Promise<VCSEntry | UIError> {
    const lsTreeResult = await execFileStdoutTrimEOL({
      filePath: gitPath,
      arguments_: ["ls-tree", "HEAD", "--", absoluteVersionPath],
      options: { cwd },
    });
    if (typeof lsTreeResult !== "string") {
      return createUIError(
        `\`git ls-tree\` error: ${formatExecFileError(lsTreeResult)}`
      );
    }
    return {
      type:
        lsTreeResult.length === 0
          ? VCSEntryType.notExisting
          : VCSEntryType.directory,
    };
  }
  private analyzeVCSEntry({
    mode,
    object,
    absPath,
  }: {
    mode: string;
    object: string;
    absPath?: string;
  }): VCSEntry | UIError {
    const type: VCSEntryType | undefined =
      mode === "160000"
        ? VCSEntryType.subModule
        : mode === "120000"
        ? VCSEntryType.symbolicLink
        : VCSEntryType.regularFile;
    return { type, object, absPath };
  }
  public static lsFilesURE = /^(?<mode>\S+) (?<object>\S+) (?<stage>\S+)\t(?<path>.*)$/;
  public async getGitDirectoryInteractively(
    gitPath: string,
    cwd: string
  ): Promise<string | undefined> {
    const result = await execFileStdoutInteractivelyTrimEOL({
      filePath: gitPath,
      arguments_: ["rev-parse", "--git-dir"],
      options: { cwd },
    });
    if (result === undefined) {
      return undefined;
    }
    return resolvePath(cwd, result);
  }
  public async getGitRoot(
    gitPath: string,
    cwd: string
  ): Promise<string | undefined> {
    return await execFileStdoutInteractivelyTrimEOL({
      filePath: gitPath,
      arguments_: ["rev-parse", "--show-toplevel"],
      options: { cwd },
    });
  }
}

export interface MergeNotApplicableResult {
  readonly resultName: "MergeNotApplicableResult";
  readonly type: MergeNotApplicableType;
}
export const enum MergeNotApplicableType {
  fileNotFound,
  noMergeRequired,
}
export const fileNotFoundResult: MergeNotApplicableResult = {
  resultName: "MergeNotApplicableResult",
  type: MergeNotApplicableType.fileNotFound,
};
export const noMergeRequiredResult: MergeNotApplicableResult = {
  resultName: "MergeNotApplicableResult",
  type: MergeNotApplicableType.noMergeRequired,
};

type VersionName = "base" | "local" | "remote";
const versionNames: VersionName[] = ["base", "local", "remote"];
export type MergeConflictSituation = { [k in VersionName]: VCSEntry };

export interface VCSEntry {
  readonly type: VCSEntryType;
  readonly absPath?: string; // undefined for deleted entries
  readonly object?: string; // SHA-1 hash, undefined for deleted entries
}

export const enum VCSEntryType {
  notExisting,
  directory,
  regularFile,
  subModule,
  symbolicLink,
}
