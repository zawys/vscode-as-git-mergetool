// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import path from "path";
import { commands, Disposable, QuickPickItem, window } from "vscode";
import { createBackgroundGitTerminal } from "./backgroundGitTerminal";
import { getStats } from "./fsHandy";
import { getWorkingDirectoryUri } from "./getPathsWithinVSCode";
import { RegisterableService } from "./registerableService";

export class MergeAborter implements RegisterableService {
  public register(): void | Promise<void> {
    this.abortMergeCommandRegistration = commands.registerCommand(
      abortMergeCommandID,
      this.abortMerge.bind(this)
    );
  }
  public dispose(): void {
    this.abortMergeCommandRegistration?.dispose();
    this.abortMergeCommandRegistration = undefined;
  }

  // by https://stackoverflow.com/a/30783114/1717752
  public async isMergeInProgress(): Promise<boolean | undefined> {
    const workingDirectoryUri = getWorkingDirectoryUri();
    if (workingDirectoryUri === undefined) {
      return undefined;
    }
    const stats = await getStats(
      path.join(workingDirectoryUri.fsPath, ".git/MERGE_HEAD")
    );
    if (stats === undefined) {
      return undefined;
    }
    return stats.isFile();
  }

  public async abortMerge(): Promise<void> {
    if (!(await this.isMergeInProgress())) {
      this.warnNoMergeInProgress();
      return;
    }

    const quitMerge: QuickPickItem = {
      label: "Keep working directory and index",
      detail: "runs `git merge --quit`",
    };
    const abortMerge: QuickPickItem = {
      label: "DISCARD changes in working directory and index",
      detail: "runs `git merge --abort`",
    };
    const nothing: QuickPickItem = {
      label: "Do nothing",
    };
    const pickedItem = await window.showQuickPick(
      [quitMerge, abortMerge, nothing],
      {
        ignoreFocusOut: true,
        matchOnDetail: true,
        placeHolder: "Select an action",
      }
    );
    if (pickedItem === nothing || pickedItem === undefined) {
      return;
    }

    if (!(await this.isMergeInProgress())) {
      this.warnNoMergeInProgress();
      return;
    }
    await createBackgroundGitTerminal({
      shellArgs: ["merge", pickedItem === abortMerge ? "--abort" : "--quit"],
    });
  }

  private abortMergeCommandRegistration: Disposable | undefined = undefined;

  private warnNoMergeInProgress(): void {
    void window.showWarningMessage("No git merge in progress");
  }
}

const abortMergeCommandID = "vscode-as-git-mergetool.gitMergeAbort";
