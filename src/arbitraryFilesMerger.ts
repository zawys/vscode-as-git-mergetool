// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as vscode from "vscode";
import { DiffedURIs } from "./diffedURIs";
import { DiffFileSelector } from "./diffFileSelector";
import { DiffLayouterManager } from "./diffLayouterManager";
import { getVSCGitPathInteractively } from "./getPathsWithinVSCode";
import { gitMergeFile } from "./gitMergeFile";
import { extensionID } from "./iDs";
import { Lazy } from "./lazy";
import { readonlyFileURI } from "./readonlyDocumentProvider";
import { RegisterableService } from "./registerableService";
import { isUIError } from "./uIError";

export class ArbitraryFilesMerger implements RegisterableService {
  public register(): void {
    this.disposables = [
      vscode.commands.registerCommand(
        mergeArbitraryFilesCommandID,
        this.mergeArbitraryFiles.bind(this)
      ),
    ];
  }

  public dispose(): void {
    for (const disposabe of this.disposables) {
      disposabe.dispose();
    }
  }

  public async mergeArbitraryFiles(): Promise<boolean> {
    const selectionResult = await this.diffFileSelectorLazy.value.doSelection();
    if (selectionResult === undefined) {
      return false;
    }
    const gitPath = await getVSCGitPathInteractively();
    if (gitPath === undefined) {
      return false;
    }
    const mergedPath = selectionResult.merged.fsPath;
    if (selectionResult.merged.validationResult?.emptyLoc === true) {
      const mergeFileResult = await gitMergeFile(gitPath, {
        local: selectionResult.local.fsPath,
        base: selectionResult.base.fsPath,
        remote: selectionResult.remote.fsPath,
        merged: mergedPath,
      });
      if (isUIError(mergeFileResult)) {
        void vscode.window.showErrorMessage(mergeFileResult.message);
        return false;
      }
    }
    const diffedURIs: DiffedURIs = new DiffedURIs(
      readonlyFileURI(selectionResult.base.fsPath),
      readonlyFileURI(selectionResult.local.fsPath),
      readonlyFileURI(selectionResult.remote.fsPath),
      vscode.Uri.file(selectionResult.merged.fsPath)
    );
    return await this.diffLayouterManager.openDiffedURIs(diffedURIs, false);
  }

  public constructor(
    private readonly diffLayouterManager: DiffLayouterManager,
    private diffFileSelectorLazy = new Lazy(() => new DiffFileSelector())
  ) {}

  private disposables: vscode.Disposable[] = [];
}

const mergeArbitraryFilesCommandID = `${extensionID}.mergeArbitraryFiles`;
