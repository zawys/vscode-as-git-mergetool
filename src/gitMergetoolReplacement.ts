// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import nodePath from "path";
import { dir } from "tmp-promise";
import {
  commands,
  Disposable,
  QuickPickItem,
  StatusBarAlignment,
  Uri,
  window,
} from "vscode";
import {
  execFilePromise,
  execFileStdout,
  execFileStdoutTrimEOL,
  formatExecFileError,
} from "./childProcessHandy";
import { CommonMergeCommandsManager } from "./commonMergeCommandsManager";
import { DiffedURIs, pathsRoughlyEqual } from "./diffedURIs";
import { DiffLayouterManager } from "./diffLayouterManager";
import { EditorOpenHandler } from "./editorOpenHandler";
import { generateFileNameStampUntil } from "./fileNameStamp";
import {
  copy,
  FileType,
  getContents,
  getFileType,
  mkdir,
  remove,
  rename,
  setContents,
} from "./fsHandy";
import { getVSCGitPath } from "./getPathsWithinVSCode";
import { gitMergeFile } from "./gitMergeFile";
import { firstLetterUppercase } from "./ids";
import { ManualMergeProcess, ManualMergeResult } from "./manualMergeProcess";
import { Monitor } from "./monitor";
import { ReadonlyDocumentProvider } from "./readonlyDocumentProvider";
import { RegisterableService } from "./registerableService";
import { RegisteredDocumentContentProvider } from "./registeredDocumentContentProvider";
import { combineUIErrors, createUIError, isUIError, UIError } from "./uIError";

/*
 * Several approaches copied from git-mergetool which is under GPLv2.
 */
export class GitMergetoolReplacement
  implements RegisterableService, EditorOpenHandler {
  public register(): void {
    this.disposables.push(
      this.commonMergeCommandsManager.addHandler({
        continueMergeProcess: this.continueMergeProcess.bind(this),
        stopMergeProcess: this.stopMergeProcess.bind(this),
        doNextStepInMergeProcess: this.doNextStepInMergeProcess.bind(this),
      })
    );
  }
  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
  public async handleDidOpenURI(uRI: Uri): Promise<boolean | UIError> {
    let pathsToIgnoreSetToken: unknown;
    await this.monitor.enter();
    try {
      const absoluteConflictPath = nodePath.resolve(uRI.fsPath);
      const cwd = nodePath.dirname(absoluteConflictPath);
      const situation = await this.analyzeConflictSituation(
        absoluteConflictPath
      );
      if (isUIError(situation) || isMergeNotApplicableResult(situation)) {
        return false;
      }
      const gitPath = await getVSCGitPath();
      if (isUIError(gitPath)) return gitPath;
      const absoluteRepoRoot = await this.getAbsoluteGitRoot(gitPath, cwd);
      if (isUIError(absoluteRepoRoot)) return absoluteRepoRoot;
      const generatedFilePaths = await this.generateFilePaths(
        absoluteConflictPath
      );
      if (isUIError(generatedFilePaths)) return generatedFilePaths;

      pathsToIgnoreSetToken = this.setURIsToIgnore(generatedFilePaths);

      const checkoutResult = await this.checkoutStages(
        gitPath,
        cwd,
        absoluteRepoRoot,
        absoluteConflictPath,
        situation,
        generatedFilePaths
      );
      if (isUIError(checkoutResult)) return checkoutResult;

      // point of rather no return

      await this.diffLayouterManager.closeActiveEditor();
      const absoluteMergedPath = await this.getAbsoluteMergeFilePathInteractively(
        gitPath,
        absoluteRepoRoot,
        situation
      );
      if (isUIError(absoluteMergedPath)) return absoluteMergedPath;

      pathsToIgnoreSetToken = this.setURIsToIgnore(
        generatedFilePaths,
        absoluteMergedPath
      );

      return await this.resolveMergeSituation(
        gitPath,
        cwd,
        absoluteMergedPath,
        absoluteConflictPath,
        situation,
        generatedFilePaths
      );
    } finally {
      await this.monitor.leave();
      this.clearURIsToIgnore(pathsToIgnoreSetToken);
    }
  }
  public async stopMergeProcess(): Promise<boolean> {
    await this.monitor.enter();
    try {
      if (this.manualMergeInProgress) {
        void this.manualMergeProcess.stopMergeProcess();
        return true;
      }
      void window.showErrorMessage("No merge in process");
      return false;
    } finally {
      await this.monitor.leave();
    }
  }
  public async continueMergeProcess(): Promise<boolean> {
    await this.monitor.enter();
    try {
      if (this.manualMergeInProgress) {
        void this.manualMergeProcess.doNextStepInMergeProcess();
        return true;
      }
      void window.showErrorMessage("No merge in process");
      return false;
    } finally {
      await this.monitor.leave();
    }
  }
  public async doNextStepInMergeProcess(): Promise<boolean> {
    await this.monitor.enter();
    try {
      if (this.manualMergeInProgress) {
        void this.manualMergeProcess.doNextStepInMergeProcess();
        return true;
      }
      this.manualMergeProcess;
      // TODO [2021-03-31]
      throw new Error("Not implemented");
    } finally {
      await this.monitor.leave();
    }
  }
  // public async getConflictingFiles(
  //   gitPath: string,
  //   cwd: string
  // ): Promise<string[] | UIError> {
  //   const gitDiffResult = await execFileStdoutTrimEOL({
  //     filePath: gitPath,
  //     arguments_: [
  //       "-c",
  //       "core.quotePath=false",
  //       "diff",
  //       "--name-only",
  //       "--diff-filter=U",
  //     ],
  //     options: { cwd },
  //   });
  //   if (typeof gitDiffResult !== "string") {
  //     return createUIError(
  //       `\`git diff\` threw: ${formatExecFileError(gitDiffResult)}`
  //     );
  //   }
  //   return gitDiffResult.split("\n").slice(0, -1);
  // }
  public async analyzeConflictSituation(
    absoluteConflictPath: string
  ): Promise<MergeConflictSituation | MergeNotApplicableResult | UIError> {
    const cwd = nodePath.dirname(absoluteConflictPath);
    const gitPath = await getVSCGitPath();
    if (typeof gitPath !== "string") {
      return gitPath;
    }
    const versions = await this.getVCSConflictState(
      gitPath,
      absoluteConflictPath,
      cwd
    );
    if (isMergeNotApplicableResult(versions) || isUIError(versions)) {
      return versions;
    }
    for (const stage of stages) {
      if (versions[stage] === undefined) {
        const analysisResult = await this.analyzeNotExistingVCSEntry(
          gitPath,
          cwd,
          absoluteConflictPath
        );
        if (isUIError(analysisResult)) {
          return analysisResult;
        }
        versions[stage] = analysisResult;
      }
    }
    return {
      ...(versions as { [k in Stage]: VCSEntry }),
      [InvolvedPath.conflict]: await getFileType(absoluteConflictPath),
    };
  }
  public ignorePathOverride(fsPath: string): boolean {
    return this._pathsToIgnore.some(pathsRoughlyEqual.bind(undefined, fsPath));
  }
  public constructor(
    private readonly registeredDocumentProvider: RegisteredDocumentContentProvider,
    private readonly readonlyDocumentProvider: ReadonlyDocumentProvider,
    private readonly commonMergeCommandsManager: CommonMergeCommandsManager,
    private readonly manualMergeProcess: ManualMergeProcess,
    private readonly diffLayouterManager: DiffLayouterManager
  ) {}
  public static lsFilesURE = /^(?<mode>\S+) (?<object>\S+) (?<stage>\S+)\t(?<path>.*)$/;

  private _pathsToIgnore: string[] = [];
  private readonly monitor = new Monitor();
  private disposables: Disposable[] = [];
  private manualMergeInProgress = false;
  private async resolveMergeSituation(
    gitPath: string,
    cwd: string,
    absoluteMergedPath: string | undefined,
    absoluteConflictPath: string,
    situation: MergeConflictSituation,
    generatedFilePaths: GeneratedPathDict
  ): Promise<boolean | UIError> {
    if (absoluteMergedPath === undefined) {
      const resolveDeleteResult = await this.resolveDeleteSituation(
        gitPath,
        cwd,
        absoluteConflictPath
      );
      if (isUIError(resolveDeleteResult)) return resolveDeleteResult;
    } else {
      const resolveContentMergeResult = await this.resolveContentMergeSituation(
        gitPath,
        cwd,
        absoluteMergedPath,
        absoluteConflictPath,
        situation,
        generatedFilePaths
      );
      if (isUIError(resolveContentMergeResult))
        return resolveContentMergeResult;
    }
    const deleteStagesResult = await this.deleteStages(generatedFilePaths);
    if (isUIError(deleteStagesResult)) return deleteStagesResult;
    return true;
  }
  private async resolveDeleteSituation(
    gitPath: string,
    cwd: string,
    absoluteConflictPath: string
  ): Promise<void | UIError> {
    const removeResult = await this.gitRemovePath(
      gitPath,
      cwd,
      absoluteConflictPath
    );
    if (isUIError(removeResult)) return removeResult;
  }
  private async resolveContentMergeSituation(
    gitPath: string,
    cwd: string,
    absoluteMergedPath: string,
    absoluteConflictPath: string,
    situation: MergeConflictSituation,
    generatedFilePaths: GeneratedPathDict
  ): Promise<void | UIError> {
    if (absoluteConflictPath !== absoluteMergedPath) {
      const renameResult = await mkdir(nodePath.dirname(absoluteMergedPath));
      if (isUIError(renameResult)) return renameResult;
      // TODO [2021-03-31]: Does that work with submodules?
      const moveResult = await rename(
        absoluteConflictPath,
        absoluteMergedPath
      );
      if (isUIError(moveResult)) return moveResult;
    }
    const baseURI = this.getBaseURI(situation, generatedFilePaths);
    const localAndRemote: (InvolvedPath.local | InvolvedPath.remote)[] = [
      InvolvedPath.local,
      InvolvedPath.remote,
    ];
    const regularPathSituations = localAndRemote
      .map((path): [InvolvedPath, VCSEntry] => [path, situation[path]])
      .filter(
        (pathSituation) => pathSituation[1].type === VCSEntryType.regularFile
      );
    if (regularPathSituations.length === 2) {
      const mergeResult = await this.mergeFiles({
        gitPath,
        cwd,
        absoluteConflictPath,
        absoluteMergedPath,
        baseURI,
        generatedFilePaths,
      });
      if (isUIError(mergeResult)) return mergeResult;
    } else {
      if (regularPathSituations.length > 0) {
        const [path, pathSituation] = regularPathSituations[0];
        if (pathSituation.absPath !== undefined) {
          await commands.executeCommand(
            "vscode.diff",
            baseURI,
            Uri.file(pathSituation.absPath),
            `${
              path === InvolvedPath.local ? "Current" : "Incoming"
            } changes on base`,
            {
              preview: false,
              preserveFocus: false,
            }
          );
        }
      }
      const selectStageResult = await this.selectStageInteractively(
        gitPath,
        cwd,
        absoluteConflictPath,
        absoluteMergedPath,
        situation,
        false
      );
      if (isUIError(selectStageResult)) return selectStageResult;
    }
  }
  private setURIsToIgnore(
    generatedFilePaths: GeneratedPathDict,
    absoluteMergedPath?: string
  ): unknown {
    this._pathsToIgnore = [
      generatedFilePaths[InvolvedPath.base],
      generatedFilePaths[InvolvedPath.local],
      generatedFilePaths[InvolvedPath.remote],
    ];
    if (absoluteMergedPath !== undefined) {
      this._pathsToIgnore.push(absoluteMergedPath);
    }
    return this._pathsToIgnore;
  }
  private clearURIsToIgnore(token: unknown): void {
    if (token === this._pathsToIgnore) {
      this._pathsToIgnore = [];
    }
  }
  private async getAbsoluteGitRoot(
    gitPath: string,
    cwd: string
  ): Promise<string | UIError> {
    const execFileStdoutResult = await execFileStdoutTrimEOL({
      filePath: gitPath,
      arguments_: ["rev-parse", "--show-toplevel"],
      options: { cwd },
    });
    if (typeof execFileStdoutResult !== "string") {
      return createUIError(
        `Could not determine Git repository root: ${formatExecFileError(
          execFileStdoutResult
        )}`
      );
    }
    return nodePath.resolve(cwd, execFileStdoutResult);
  }
  private async selectStageInteractively(
    gitPath: string,
    cwd: string,
    absoluteConflictPath: string,
    absoluteMergedPath: string,
    situation: MergeConflictSituation,
    showSkipItem: boolean
  ): Promise<UIError | SelectStageResult> {
    const basePath = situation[InvolvedPath.base].absPath;
    const describe = (stage: Stage): string => {
      const entry = situation[stage];
      const typeName = vCSEntryTypeName[situation[InvolvedPath.local].type];
      const renamed =
        basePath !== undefined &&
        entry.absPath !== undefined &&
        basePath !== entry.absPath;
      const entryName = firstLetterUppercase(involvedPathNames[stage]);
      return `${entryName}: ${typeName}${renamed ? " (renamed)" : ""}`;
    };
    const localItem = {
      label: describe(InvolvedPath.local),
      detail: situation[InvolvedPath.local].absPath || "",
    };
    const remoteItem = {
      label: describe(InvolvedPath.remote),
      detail: situation[InvolvedPath.remote].absPath || "",
    };
    const skipItem = { label: "Skip" };
    const cancelItem = { label: "Cancel" };
    const items: QuickPickItem[] = [localItem, remoteItem];
    if (showSkipItem) {
      items.push(skipItem);
    }
    items.push(cancelItem);
    const pickResult = await window.showQuickPick(items, {
      ignoreFocusOut: true,
      matchOnDetail: true,
    });
    if (pickResult === skipItem) {
      return SelectStageResult.skip;
    } else if (pickResult === localItem) {
      return (
        (await this.selectStage(
          gitPath,
          cwd,
          absoluteConflictPath,
          absoluteMergedPath,
          situation[InvolvedPath.local]
        )) || SelectStageResult.accepted
      );
    } else if (pickResult === remoteItem) {
      return (
        (await this.selectStage(
          gitPath,
          cwd,
          absoluteConflictPath,
          absoluteMergedPath,
          situation[InvolvedPath.remote]
        )) || SelectStageResult.accepted
      );
    } else {
      return SelectStageResult.cancel;
    }
  }
  private async selectStage(
    gitPath: string,
    cwd: string,
    absoluteConflictPath: string,
    absoluteMergedPath: string,
    entry: VCSEntry
  ): Promise<UIError | void> {
    if (
      entry.type === VCSEntryType.notExisting ||
      absoluteMergedPath !== absoluteConflictPath
    ) {
      const removeResult = await this.gitRemovePath(
        gitPath,
        cwd,
        absoluteConflictPath
      );
      if (isUIError(removeResult)) {
        return removeResult;
      }
    }
    if (entry.type === VCSEntryType.regularFile) {
      const addResult = await this.gitAddFile(
        gitPath,
        cwd,
        absoluteMergedPath
      );
      if (isUIError(addResult)) {
        return addResult;
      }
    }
  }
  private async mergeFiles({
    gitPath,
    cwd,
    absoluteConflictPath,
    absoluteMergedPath,
    baseURI,
    generatedFilePaths,
  }: {
    gitPath: string;
    cwd: string;
    absoluteConflictPath: string;
    absoluteMergedPath: string;
    baseURI: Uri;
    generatedFilePaths: GeneratedPathDict;
  }): Promise<UIError | boolean> {
    const diffedURIs = new DiffedURIs(
      baseURI,
      Uri.file(generatedFilePaths[InvolvedPath.local]),
      Uri.file(generatedFilePaths[InvolvedPath.remote]),
      Uri.file(absoluteMergedPath),
      Uri.file(generatedFilePaths[InvolvedPath.backup])
    );
    const manualMergeResult = await this.mergeManually(
      diffedURIs,
      "Merge file"
    );
    if (manualMergeResult === ManualMergeResult.continue) {
      const acceptMergedFileResult = await this.acceptMergedFile(
        gitPath,
        cwd,
        diffedURIs,
        absoluteConflictPath,
        absoluteMergedPath
      );
      if (isUIError(acceptMergedFileResult)) {
        return acceptMergedFileResult;
      }
    }
    return true;
  }
  private async mergeManually(
    diffedURIs: DiffedURIs,
    labelText: string
  ): Promise<ManualMergeResult> {
    if (this.manualMergeInProgress) {
      await this.manualMergeProcess.stopMergeProcess();
    }
    this.manualMergeInProgress = true;
    try {
      return this.manualMergeProcess.mergeManually(diffedURIs, labelText);
    } finally {
      this.manualMergeInProgress = false;
    }
  }
  private async acceptMergedFile(
    gitPath: string,
    cwd: string,
    diffedURIs: DiffedURIs,
    absoluteConflictPath: string,
    absoluteMergedPath: string
  ): Promise<UIError | undefined> {
    if (
      nodePath.resolve(absoluteConflictPath) !==
      nodePath.resolve(absoluteMergedPath)
    ) {
      const gitRMResult = await execFileStdout({
        filePath: gitPath,
        arguments_: ["rm", "--", absoluteConflictPath],
        options: { cwd },
      });
      if (isUIError(gitRMResult)) {
        return gitRMResult;
      }
    }
    const addResult = await this.gitAddFile(gitPath, cwd, absoluteMergedPath);
    if (isUIError(addResult)) {
      return addResult;
    }
    const fileURIsToRemove = [
      diffedURIs.base,
      diffedURIs.local,
      diffedURIs.remote,
    ];
    if (diffedURIs.backup !== undefined) {
      fileURIsToRemove.push(diffedURIs.backup);
    }
    const removeResults = await Promise.all(
      fileURIsToRemove.map((fileURIToRemove) => remove(fileURIToRemove.fsPath))
    );
    const errors = removeResults.filter((result): result is UIError =>
      isUIError(result)
    );
    if (errors.length > 0) {
      return combineUIErrors(errors);
    }
    return undefined;
  }
  private async gitRemovePath(
    gitPath: string,
    cwd: string,
    pathToRemove: string
  ): Promise<UIError | void> {
    const gitRMResult = await execFilePromise({
      filePath: gitPath,
      arguments_: ["rm", "--", pathToRemove],
      options: { cwd },
    });
    if (gitRMResult.error !== null) {
      return createUIError(
        `Error on removing file ${pathToRemove}: ${formatExecFileError(
          gitRMResult
        )}`
      );
    }
  }
  private async gitAddFile(
    gitPath: string,
    cwd: string,
    pathToAdd: string
  ): Promise<UIError | void> {
    const stageResult = await execFileStdoutTrimEOL({
      filePath: gitPath,
      arguments_: ["add", "--", pathToAdd],
      options: { cwd },
    });
    if (isUIError(stageResult)) {
      return stageResult;
    }
  }
  private async checkoutStages(
    gitPath: string,
    cwd: string,
    absoluteRepoRoot: string,
    absoluteConflictPath: string,
    situation: MergeConflictSituation,
    generatedFilePaths: GeneratedPathDict
  ): Promise<UIError | undefined> {
    for (const stage of stages) {
      const stageType = situation[stage].type;
      if (
        stageType === VCSEntryType.regularFile ||
        stageType === VCSEntryType.symbolicLink ||
        stageType === VCSEntryType.directory
      ) {
        const checkOutResult = await this.checkOutStageFile(
          gitPath,
          cwd,
          absoluteRepoRoot,
          absoluteConflictPath,
          stage,
          generatedFilePaths[stage]
        );
        if (isUIError(checkOutResult)) {
          return checkOutResult;
        }
      }
    }
    const createBackupResult = copy(
      absoluteConflictPath,
      generatedFilePaths[InvolvedPath.backup]
    );
    if (isUIError(createBackupResult)) {
      return createUIError(
        `Error on creating backup file: ${createBackupResult.message}`
      );
    }
    return undefined;
  }
  private async deleteStages(
    generatedFilePaths: GeneratedPathDict
  ): Promise<UIError | void> {
    for (const pathKind of generatedPaths) {
      const removeResult = await remove(generatedFilePaths[pathKind]);
      if (isUIError(removeResult)) {
        return removeResult;
      }
    }
  }
  /**
   *
   * @param gitPath
   * @param situation
   * @returns merged path, error, or undefined when the file shall be deleted
   */
  private async getAbsoluteMergeFilePathInteractively(
    gitPath: string,
    absoluteRepoRoot: string,
    situation: MergeConflictSituation
  ): Promise<string | undefined | UIError> {
    const getAbsolutePath = (pathName: Stage): string | undefined =>
      situation[pathName].absPath;

    const absoluteBasePath = getAbsolutePath(InvolvedPath.base);
    const absoluteLocalPath = getAbsolutePath(InvolvedPath.local);
    const absoluteRemotePath = getAbsolutePath(InvolvedPath.remote);

    if (absoluteLocalPath === absoluteRemotePath) {
      return absoluteLocalPath === undefined
        ? absoluteBasePath
        : absoluteLocalPath;
    }

    if (absoluteBasePath === absoluteLocalPath) {
      return absoluteRemotePath;
    } else if (absoluteBasePath === absoluteRemotePath) {
      return absoluteLocalPath;
    }

    if (absoluteLocalPath === undefined) {
      return absoluteRemotePath;
    } else if (absoluteRemotePath === undefined) {
      return absoluteLocalPath;
    }

    const relativeBasePath =
      absoluteBasePath === undefined
        ? undefined
        : nodePath.relative(absoluteRepoRoot, absoluteBasePath);
    const relativeLocalPath = nodePath.relative(
      absoluteRepoRoot,
      absoluteLocalPath
    );
    const relativeRemotePath = nodePath.relative(
      absoluteRepoRoot,
      absoluteRemotePath
    );

    const temporaryDirectory = await dir();
    const addTemporaryFile = async (
      name: string,
      content?: string
    ): Promise<string | UIError> => {
      const temporaryFilePath = nodePath.join(temporaryDirectory.path, name);
      if (content !== undefined) {
        const setResult = await setContents(temporaryFilePath, content);
        if (setResult !== undefined) {
          return setResult;
        }
      }
      return temporaryFilePath;
    };
    const addTemporaryPathFile = (
      name: string,
      path?: string
    ): Promise<string | UIError> => {
      const content =
        path === undefined ? undefined : path.split(nodePath.sep).join("\n");
      return addTemporaryFile(name, content);
    };

    const basePathDocumentPath = await addTemporaryPathFile(
      "base",
      relativeBasePath
    );
    if (isUIError(basePathDocumentPath)) {
      return basePathDocumentPath;
    }
    const localPathDocumentPath = await addTemporaryPathFile(
      "local",
      relativeLocalPath
    );
    if (isUIError(localPathDocumentPath)) {
      return localPathDocumentPath;
    }
    const remotePathDocumentPath = await addTemporaryPathFile(
      "remote",
      relativeRemotePath
    );
    if (isUIError(remotePathDocumentPath)) {
      return remotePathDocumentPath;
    }
    const mergedPathDocumentPath = await addTemporaryPathFile("merged");
    if (isUIError(mergedPathDocumentPath)) {
      return mergedPathDocumentPath;
    }

    const automaticMergeResult = gitMergeFile(gitPath, {
      base: basePathDocumentPath,
      local: localPathDocumentPath,
      remote: remotePathDocumentPath,
      merged: mergedPathDocumentPath,
    });
    if (automaticMergeResult !== undefined) {
      return automaticMergeResult;
    }

    const basePathDocumentURI = this.readonlyDocumentProvider.readonlyFileURI(
      basePathDocumentPath
    );
    const localPathDocumentURI = this.readonlyDocumentProvider.readonlyFileURI(
      localPathDocumentPath
    );
    const remotePathDocumentURI = this.readonlyDocumentProvider.readonlyFileURI(
      remotePathDocumentPath
    );
    const mergedPathDocumentURI = Uri.file(mergedPathDocumentPath);

    const diffedPathURIs = new DiffedURIs(
      basePathDocumentURI,
      localPathDocumentURI,
      remotePathDocumentURI,
      mergedPathDocumentURI
    );
    const infoSBI = window.createStatusBarItem(StatusBarAlignment.Left, 0);
    infoSBI.text = "Merge the path which has changed in both versions";
    const manualMergeResult = await this.manualMergeProcess.mergeManually(
      diffedPathURIs,
      "Merge paths"
    );
    infoSBI.dispose();
    if (manualMergeResult === ManualMergeResult.stop) {
      return createUIError("Merging paths has been stopped by user");
    } else if (manualMergeResult === ManualMergeResult.error) {
      return createUIError("Error merging paths.");
    }
    const mergedPathResult = (
      await getContents(mergedPathDocumentPath)
    )?.trim();
    if (mergedPathResult === undefined) {
      return createUIError("Could not read merge path file");
    }
    return mergedPathResult.length === 0
      ? undefined
      : nodePath.resolve(absoluteRepoRoot, mergedPathResult);
  }
  private splitPath(path: string): string {
    return [...path.split(nodePath.sep), ""].join("\n");
  }
  private getBaseURI(
    situation: MergeConflictSituation,
    stageFilePaths: GeneratedPathDict
  ): Uri {
    if (situation[InvolvedPath.base].type === VCSEntryType.regularFile) {
      return Uri.file(stageFilePaths[InvolvedPath.base]);
    }
    return this.registeredDocumentProvider.getEmptyDocumentURI();
  }
  private generateFilePaths(
    conflictingFilePath: string
  ): Promise<GeneratedPathDict | UIError> {
    const parsedPath = nodePath.parse(conflictingFilePath);
    return generateFileNameStampUntil<GeneratedPathDict>(async (stamp) => {
      const result: Partial<GeneratedPathDict> = {};
      for (const checkedOutFile of generatedPaths) {
        const stageFilePath =
          `${parsedPath.dir}${nodePath.sep}${parsedPath.name}` +
          `.${stamp}_${involvedPathNames[checkedOutFile]}${parsedPath.ext}`;
        const fileType = await getFileType(stageFilePath);
        switch (fileType) {
          case undefined:
            return createUIError(
              `Could not ascertain file type of ${
                stageFilePath || "undefined"
              }`
            );
          case FileType.notExisting:
            result[checkedOutFile] = stageFilePath;
            break;
          default:
            return false;
        }
      }
      return result as GeneratedPathDict;
    });
  }
  private static checkoutIndexTempFileRE = /^(?<temp_file>[^\t]*)\t/;
  private async checkOutStageFile(
    gitPath: string,
    cwd: string,
    absoluteRepoRoot: string,
    absoluteConflictPath: string,
    stage: InvolvedPath.base | InvolvedPath.local | InvolvedPath.remote,
    destinationPath: string
  ): Promise<UIError | void> {
    const checkoutIndexResult = await execFileStdoutTrimEOL({
      filePath: gitPath,
      arguments_: [
        "checkout-index",
        "--temp",
        `--stage=${stageIDMap[stage]}`,
        "--",
        absoluteConflictPath,
      ],
      options: { cwd },
    });
    if (typeof checkoutIndexResult !== "string") {
      return createUIError(formatExecFileError(checkoutIndexResult));
    }
    const match = GitMergetoolReplacement.checkoutIndexTempFileRE.exec(
      checkoutIndexResult
    );
    const temporaryFile = match?.groups?.temp_file;
    if (temporaryFile === undefined) {
      return createUIError("Could not parse `git checkout-index` output");
    }
    const renameResult = await rename(
      nodePath.resolve(absoluteRepoRoot, temporaryFile),
      destinationPath
    );
    if (isUIError(renameResult)) {
      return createUIError(
        `Could not move checked-out file to destination \`${destinationPath}\`: ${renameResult.message}`
      );
    }
  }
  private async getVCSConflictState(
    gitPath: string,
    absoluteConflictPath: string,
    cwd: string
  ): Promise<
    { [k in Stage]?: VCSEntry } | MergeNotApplicableResult | UIError
  > {
    const lsFilesResult = await execFileStdoutTrimEOL({
      filePath: gitPath,
      arguments_: ["ls-files", "-u", "--", absoluteConflictPath],
      options: { cwd },
    });
    if (typeof lsFilesResult !== "string") {
      return createUIError(
        `git ls-files threw: ${formatExecFileError(lsFilesResult)}`
      );
    }

    if (lsFilesResult === "") {
      const fileType = await getFileType(
        nodePath.resolve(absoluteConflictPath)
      );
      return fileType === FileType.notExisting
        ? fileNotFoundResult
        : noMergeRequiredResult;
    }

    const versions: { [k in Stage]?: VCSEntry } = {};
    const stageVersionNameMap: {
      [stage: string]: Stage | undefined;
    } = {
      "1": InvolvedPath.base,
      "2": InvolvedPath.local,
      "3": InvolvedPath.remote,
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
      if (!mode || !object || !stage || !path) {
        return createUIError("Could not parse output of git ls-files");
      }
      const versionName = stageVersionNameMap[stage];
      if (versionName === undefined) {
        return createUIError("Unexpected output of ls-files");
      }
      const type = this.getVCSEntryType(mode);
      const absPath = nodePath.resolve(cwd, path);
      versions[versionName] = { type, absPath, object };
    }
    return versions;
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
    if (lsTreeResult.length === 0) {
      return {
        type: VCSEntryType.notExisting,
      };
    }
    return {
      type: VCSEntryType.directory,
      absPath: absoluteVersionPath,
    };
  }
  private getVCSEntryType(
    mode: string
  ): Exclude<VCSEntryType, VCSEntryType.notExisting> {
    return mode === "160000"
      ? VCSEntryType.subModule
      : mode === "120000"
      ? VCSEntryType.symbolicLink
      : VCSEntryType.regularFile;
  }
}
const enum InvolvedPath {
  base,
  local,
  remote,
  backup,
  conflict,
  merged,
}
const involvedPathNames = {
  [InvolvedPath.base]: "base",
  [InvolvedPath.local]: "local",
  [InvolvedPath.remote]: "remote",
  [InvolvedPath.backup]: "backup",
  [InvolvedPath.conflict]: "conflict",
  [InvolvedPath.merged]: "merged",
};
type GeneratedPath =
  | InvolvedPath.base
  | InvolvedPath.local
  | InvolvedPath.remote
  | InvolvedPath.backup;
const generatedPaths: ReadonlyArray<GeneratedPath> = [
  InvolvedPath.base,
  InvolvedPath.local,
  InvolvedPath.remote,
  InvolvedPath.backup,
];
type GeneratedPathDict = { [k in GeneratedPath]: string };
type Stage = InvolvedPath.base | InvolvedPath.local | InvolvedPath.remote;
const stages: ReadonlyArray<Stage> = [
  InvolvedPath.base,
  InvolvedPath.local,
  InvolvedPath.remote,
];
const stageIDMap: { [k in Stage]: number } = {
  [InvolvedPath.base]: 1,
  [InvolvedPath.local]: 2,
  [InvolvedPath.remote]: 3,
};
export type MergeConflictSituation = {
  [stage in Stage]: VCSEntry;
} & { [InvolvedPath.conflict]: FileType | undefined };
export type VCSEntry =
  | {
      readonly type: VCSEntryType.notExisting;
      readonly absPath?: undefined; // undefined for deleted entries
      readonly object?: string; // SHA-1 hash, undefined for deleted entries
    }
  | {
      readonly type: Exclude<VCSEntryType, VCSEntryType.notExisting>;
      readonly absPath: string; // undefined for deleted entries
      readonly object?: string; // SHA-1 hash, undefined for deleted entries
    };
export const enum VCSEntryType {
  notExisting,
  directory,
  regularFile,
  subModule,
  symbolicLink,
}
export const enum SelectStageResult {
  accepted,
  skip,
  cancel,
}
export const vCSEntryTypeName = {
  [VCSEntryType.notExisting]: "deleted",
  [VCSEntryType.directory]: "directory",
  [VCSEntryType.regularFile]: "regular file",
  [VCSEntryType.subModule]: "Git submodule",
  [VCSEntryType.symbolicLink]: "symbolic link",
};
export type RegularMergeConflictSituation = MergeConflictSituation & {
  base: { type: VCSEntryType.regularFile };
  local: { type: VCSEntryType.regularFile };
  remote: { type: VCSEntryType.regularFile };
};

export const mergeNotApplicableResultTypeName = "MergeNotApplicableResult";
export interface MergeNotApplicableResult {
  readonly typeName: typeof mergeNotApplicableResultTypeName;
  readonly type: MergeNotApplicableType;
}
export const enum MergeNotApplicableType {
  fileNotFound,
  noMergeRequired,
}
export const fileNotFoundResult: MergeNotApplicableResult = {
  typeName: mergeNotApplicableResultTypeName,
  type: MergeNotApplicableType.fileNotFound,
};
export const noMergeRequiredResult: MergeNotApplicableResult = {
  typeName: mergeNotApplicableResultTypeName,
  type: MergeNotApplicableType.noMergeRequired,
};
export function isMergeNotApplicableResult(
  x: unknown
): x is MergeNotApplicableResult {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { typeName?: unknown }).typeName === mergeNotApplicableResultTypeName
  );
}
