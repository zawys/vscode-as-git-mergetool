// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { commands, Disposable, Uri, Memento, window } from "vscode";
import { DiffedURIs } from "./diffedURIs";
import { DiffFileSelector } from "./diffFileSelector";
import { DiffLayouterManager } from "./diffLayouterManager";
import { getVSCGitPathInteractively } from "./getPathsWithinVSCode";
import { gitMergeFile } from "./gitMergeFile";
import { extensionID } from "./ids";
import { Lazy } from "./lazy";
import { ReadonlyDocumentProvider } from "./readonlyDocumentProvider";
import { RegisterableService } from "./registerableService";
import { isUIError } from "./uIError";

export class ArbitraryFilesMerger implements RegisterableService {
  public register(): void {
    this.disposables = [
      commands.registerCommand(
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
        void window.showErrorMessage(mergeFileResult.message);
        return false;
      }
    }
    const diffedURIs: DiffedURIs = new DiffedURIs(
      this.readonlyDocumentProvider.readonlyFileURI(
        selectionResult.base.fsPath
      ),
      this.readonlyDocumentProvider.readonlyFileURI(
        selectionResult.local.fsPath
      ),
      this.readonlyDocumentProvider.readonlyFileURI(
        selectionResult.remote.fsPath
      ),
      Uri.file(selectionResult.merged.fsPath)
    );
    return await this.diffLayouterManager.openDiffedURIs(diffedURIs, false);
  }

  public constructor(
    private readonly diffLayouterManager: DiffLayouterManager,
    private readonly readonlyDocumentProvider: ReadonlyDocumentProvider,
    private readonly workspaceState: Memento,
    private diffFileSelectorLazy = new Lazy(
      () => new DiffFileSelector(workspaceState)
    )
  ) {}

  private disposables: Disposable[] = [];
}

const mergeArbitraryFilesCommandID = `${extensionID}.mergeArbitraryFiles`;
