// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { StatusBarAlignment, StatusBarItem, window } from "vscode";
import {
  gitMergetoolStopCommandID,
  nextMergeStepCommandID,
} from "./commonMergeCommandsManager";
import { DiffedURIs } from "./diffedURIs";
import { DiffLayouterManager } from "./diffLayouterManager";
import { SearchType } from "./layouters/diffLayouter";
import { createUIError, isUIError, UIError } from "./uIError";

export class ManualMergeProcess {
  public async mergeManually(
    diffedURIs: DiffedURIs,
    labelText: string
  ): Promise<ManualMergeResult> {
    const sBIs = this.createManualMergeProcessSBIs(labelText);
    const diffLayoutPromise = new Promise<ManualMergeResult | UIError>((async (
      resolve
    ) => {
      const uRIOpenResult = await this.diffLayouterManager.openDiffedURIs(
        diffedURIs,
        false,
        () => {
          resolve(ManualMergeResult.stop);
        }
      );
      if (!uRIOpenResult) {
        resolve(
          createUIError("Could not open diff layout for merging paths.")
        );
        return;
      }
      // const focusMergeConflictResult = this.diffLayouterManager.focusMergeConflict(
      //   SearchType.first
      // );
      // if (isUIError(focusMergeConflictResult)) {
      //   resolve(focusMergeConflictResult);
      //   return;
      // }
    }) as (resolve: (result: ManualMergeResult | UIError) => void) => void);
    for (const sBI of sBIs) {
      sBI.show();
    }
    let diffLayoutResult;
    try {
      diffLayoutResult = await diffLayoutPromise;
    } finally {
      for (const sBI of sBIs) {
        sBI.dispose();
      }
    }
    if (diffLayoutResult === ManualMergeResult.continue) {
      return diffLayoutResult;
    }
    if (isUIError(diffLayoutResult)) {
      void window.showErrorMessage(diffLayoutResult.message);
      return ManualMergeResult.error;
    }
    return diffLayoutResult;
  }
  public async doNextStepInMergeProcess(): Promise<void> {
    if (this.resolve === undefined) {
      return;
    }
    const focusMergeConflictResult = this.diffLayouterManager.focusMergeConflict(
      SearchType.next
    );
    switch (focusMergeConflictResult) {
      case undefined:
        this.resolve(
          createUIError("Could not determine next merge conflict indicator.")
        );
        break;
      case false:
        this.resolve(ManualMergeResult.continue);
        await this.diffLayouterManager.deactivateLayout();
    }
  }
  public async stopMergeProcess(): Promise<void> {
    const oldResolve = this.resolve;
    if (oldResolve !== undefined) {
      this.resolve = undefined;
      await this.diffLayouterManager.deactivateLayout();
    }
  }
  public constructor(
    private readonly diffLayouterManager: DiffLayouterManager
  ) {}
  private resolve?: (result: ManualMergeResult | UIError) => void;
  private createManualMergeProcessSBIs(labelText: string): StatusBarItem[] {
    const labelSBI = window.createStatusBarItem(StatusBarAlignment.Left, 15);
    labelSBI.text = `${labelText}:`;

    const acceptSBI = window.createStatusBarItem(StatusBarAlignment.Left, 14);
    acceptSBI.text = "$(check)";
    acceptSBI.command = nextMergeStepCommandID;

    const deactivateSBI = window.createStatusBarItem(
      StatusBarAlignment.Left,
      13
    );
    deactivateSBI.text = "$(stop)";
    deactivateSBI.command = gitMergetoolStopCommandID;
    return [labelSBI, acceptSBI, deactivateSBI];
  }
}
export const enum ManualMergeResult {
  continue,
  stop,
  error,
}
