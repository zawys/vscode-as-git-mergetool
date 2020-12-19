// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as vscode from "vscode";
import { createBackgroundGitTerminal } from "./backgroundGitTerminal";
import {
  CommonMergeCommandHandler,
  CommonMergeCommandsManager,
  gitMergetoolStopCommandID,
  nextMergeStepCommandID,
} from "./commonMergeCommandsManager";
import { DiffedURIs } from "./diffedURIs";
import { DiffLayouterManager } from "./diffLayouterManager";
import { generateFileNameStampUntil } from "./fileNameStamp";
import { copy, fileContentsEqual, FileType, getFileType } from "./fsHandy";
import { getWorkingDirectoryUriInteractively } from "./getPathsWithinVSCode";
import { extensionID, labelsInStatusBarSettingID } from "./ids";
import { DiffLayouter, SearchType } from "./layouters/diffLayouter";
import { MergetoolProcessManager } from "./mergetoolProcessManager";
import { Monitor } from "./monitor";
import { RegisterableService } from "./registerableService";
import { TemporaryFileOpenManager } from "./temporaryFileOpenManager";
import { displayProcessExitInteractively } from "./terminalProcessManager";
import { createUIError, isUIError, UIError } from "./uIError";
import { VSCodeConfigurator } from "./vSCodeConfigurator";

export class MergetoolUI
  implements RegisterableService, CommonMergeCommandHandler {
  public register(): void {
    const commands: [string, () => unknown][] = [
      /* eslint-disable @typescript-eslint/unbound-method */
      [gitMergetoolStartCommandID, this.startMergetool],
      [gitMergetoolSkipCommandID, this.skipFile],
      [gitMergetoolMergeSituationCommandID, this.reopenMergeSituation],
      [gitMergeAbortCommandID, this.abortMerge],
      [gitCommitCommandID, this.commitActiveCommitMessage],
      /* eslint-enable @typescript-eslint/unbound-method */
    ];
    for (const [commandID, handler] of commands) {
      this.registeredDisposables.add(
        vscode.commands.registerCommand(commandID, handler.bind(this))
      );
    }
    this.registeredDisposables.add(
      this.diffLayouterManager.onDidLayoutDeactivate(
        this.handleDidLayoutDeactivate.bind(this)
      )
    );
    this.registeredDisposables.add(
      this.diffLayouterManager.onDidLayoutActivate(
        this.handleDidLayoutActivate.bind(this)
      )
    );
    this.registeredDisposables.add(
      this.temporaryFileOpenManager.onDidLayoutReact(() => {
        this._processManager?.setMergetoolReacted();
      })
    );
  }

  public async startMergetool(): Promise<void> {
    if (!this.checkMonitorNotInUse()) {
      return;
    }
    await this.monitor.enter();
    try {
      if (this._processManager?.isAvailable === true) {
        if (this._mergeSituation !== undefined) {
          await this.reopenMergeSituationInner();
        }
        return;
      }
      if (this._processManager !== undefined) {
        return;
      }
      const newProcessManager = new MergetoolProcessManager();
      newProcessManager.onDidStop((success) =>
        this.handleMergetoolStop(newProcessManager, success)
      );
      if (!(await newProcessManager.start())) {
        return;
      }
      this._processManager = newProcessManager;
      await vscode.commands.executeCommand(
        "setContext",
        gitMergetoolRunningID,
        true
      );
      this.updateStatusBarItems();
      // layout launches automatically by detecting an opened *_BASE_* file
    } finally {
      await this.monitor.leave();
    }
  }

  public async continueMergeProcess(): Promise<boolean> {
    if (!this.checkMonitorNotInUse()) {
      return true;
    }
    await this.monitor.enter();
    try {
      // eslint-disable-next-line no-constant-condition
      if (
        !this.assertMergetoolActiveInteractively() ||
        !this.assertMergeSituationOpenedInteractively()
      ) {
        return false;
      }
      const focusResult = this.diffLayouterManager.focusMergeConflict(
        SearchType.first
      );
      if (focusResult === undefined) {
        void vscode.window.showErrorMessage(
          "Cannot retrieve merged file contents."
        );
        return true;
      }
      if (!focusResult) {
        await this.continueMergetoolInner();
        return true;
      }
    } finally {
      await this.monitor.leave();
    }
    const situation = this._mergeSituation;
    const cancel = "Cancel";
    const acceptIncludedIndicators = "Accept included indicators";
    const result = await vscode.window.showWarningMessage(
      "Merged file contains Git merge conflict indicators.",
      cancel,
      acceptIncludedIndicators
    );
    if (result !== acceptIncludedIndicators) {
      return true;
    }
    await this.monitor.enter();
    try {
      if (
        situation === undefined ||
        this._mergeSituation?.equals(situation) !== true
      ) {
        void vscode.window.showErrorMessage(
          "The situation has changed. Reopen the situation and try again."
        );
        return true;
      }
      if (
        !this.assertMergetoolActiveInteractively() ||
        !this.assertMergeSituationOpenedInteractively()
      ) {
        return true;
      }
      await this.continueMergetoolInner();
    } finally {
      await this.monitor.leave();
    }
    return true;
  }

  public async stopMergeProcess(): Promise<boolean> {
    if (!this.checkMonitorNotInUse()) {
      return true;
    }
    await this.monitor.enter();
    try {
      if (!this.assertMergetoolActiveInteractively()) {
        return false;
      }
      void (await this.stopMergetoolWithoutDataLossInner());
    } finally {
      await this.monitor.leave();
    }
    return true;
  }

  public async abortMerge(): Promise<void> {
    const quitMerge: vscode.QuickPickItem = {
      label: "Keep working directory and index",
      detail: "runs `git merge --quit`",
    };
    const abortMerge: vscode.QuickPickItem = {
      label: "DISCARD changes in working directory and index",
      detail: "runs `git merge --abort`",
    };
    const nothing: vscode.QuickPickItem = {
      label: "Do nothing",
    };
    const pickedItem = await vscode.window.showQuickPick(
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

    if (!this.checkMonitorNotInUse()) {
      return;
    }
    await this.monitor.enter();
    try {
      if (
        this._processManager?.isAvailable &&
        !(await this.stopMergetoolWithoutDataLossInner())
      ) {
        return;
      }
      await createBackgroundGitTerminal({
        shellArgs: ["merge", pickedItem === abortMerge ? "--abort" : "--quit"],
      });
    } finally {
      await this.monitor.leave();
    }
  }

  public async commitActiveCommitMessage(): Promise<void> {
    if (!this.checkMonitorNotInUse()) {
      return;
    }
    await this.monitor.enter();
    try {
      const document = vscode.window.activeTextEditor?.document;
      if (
        document?.languageId !== "git-commit" ||
        (!document?.uri.path.endsWith("/.git/COMMIT_EDITMSG") &&
          !document?.uri.path.endsWith("/.git/MERGE_MSG"))
      ) {
        void vscode.window.showErrorMessage(
          "Opened file does not seem to be a Git commit message."
        );
        return;
      }
      await document.save();
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
      const term = await createBackgroundGitTerminal({
        shellArgs: ["commit", "--no-edit", `--file=${document.fileName}`],
        cwd: vscode.Uri.joinPath(document.uri, "../.."),
      });
      if (term !== undefined) {
        term.show(true);
        let closed = false;
        const handler:
          | vscode.Disposable
          | undefined = vscode.window.onDidCloseTerminal((closedTerm) => {
          if (term === closedTerm) {
            const exitCode = term.exitStatus?.code;
            displayProcessExitInteractively("`git commit`", exitCode);
            closed = true;
            if (handler !== undefined) {
              handler.dispose();
              this.registeredDisposables.delete(handler);
            }
          }
        });
        if (!closed) {
          this.registeredDisposables.add(handler);
        }
      }
    } finally {
      await this.monitor.leave();
    }
  }

  public async reopenMergeSituation(): Promise<void> {
    if (!this.checkMonitorNotInUse()) {
      return;
    }
    await this.monitor.enter();
    try {
      await this.reopenMergeSituationInner();
    } finally {
      await this.monitor.leave();
    }
  }

  public async skipFile(): Promise<void> {
    if (!this.checkMonitorNotInUse()) {
      return;
    }
    await this.monitor.enter();
    try {
      if (
        !this.assertMergetoolActiveInteractively() ||
        !this.assertMergeSituationOpenedInteractively() ||
        this._mergeSituation?.backup === undefined
      ) {
        return;
      }
      await this.diffLayouterManager.save();
      if (!(await this.askForResetByMergetoolAndBackup())) {
        return;
      }
      await this.diffLayouterManager.deactivateLayout();
      this._mergeSituation = undefined;
      await this._processManager?.skip();
    } finally {
      await this.monitor.leave();
    }
  }

  public async doNextStepInMergeProcess(): Promise<boolean> {
    if (!this.checkMonitorNotInUse()) {
      return true;
    }
    const document = vscode.window.activeTextEditor?.document;
    if (document?.languageId === "git-commit") {
      await this.commitActiveCommitMessage();
      return true;
    }
    if (!this._processManager?.isAvailable) {
      return false;
    }
    if (this.mergeSituationInLayout) {
      await this.startMergetool();
      return true;
    }
    const focusResult = this.diffLayouterManager.focusMergeConflict(
      SearchType.next
    );
    if (focusResult === false) {
      await this.continueMergeProcess();
    } else if (focusResult === undefined) {
      void vscode.window.showErrorMessage(
        "Could not determine conflict indicators"
      );
    }
    return true;
  }

  public dispose(): void {
    if (this.disposing) {
      return;
    }
    this.disposing = true;
    this.disposeStatusBarItems();
    // `this.removeCommonMergeCommandsHandler();` not necessary,
    // as it is registered in `this.registeredDisposables`.
    this.registeredDisposables.forEach((item) => void item?.dispose());
    this.registeredDisposables = new Set();
    void this.disposeProcessManager();
  }

  public get mergeSituation(): DiffedURIs | undefined {
    return this._mergeSituation;
  }

  public get mergeSituationInLayout(): boolean {
    return (
      this._mergeSituation !== undefined &&
      this.diffLayouterManager.diffedURIs?.equals(this._mergeSituation) ===
        true
    );
  }

  public get processManager(): MergetoolProcessManager | undefined {
    return this._processManager;
  }

  public constructor(
    private readonly diffLayouterManager: DiffLayouterManager,
    private readonly vSCodeConfigurator: VSCodeConfigurator,
    private readonly temporaryFileOpenManager: TemporaryFileOpenManager,
    private readonly commonMergeCommandsManager: CommonMergeCommandsManager,
    private readonly monitor = new Monitor()
  ) {}

  /**
   * implies `mergetoolRunning`
   */
  private statusBarItems: vscode.StatusBarItem[] | undefined;
  private static readonly statusBarItemColor = new vscode.ThemeColor(
    "statusBar.foreground"
  );
  private _mergeSituation: DiffedURIs | undefined;
  private _processManager: MergetoolProcessManager | undefined;
  private registeredDisposables: Set<vscode.Disposable> = new Set();
  private disposing = false;

  private checkMonitorNotInUse(): boolean {
    if (this.monitor.inUse) {
      void vscode.window.showErrorMessage(
        "Another operation is pending. Please try again later."
      );
      return false;
    }
    return true;
  }

  private async disposeProcessManager(): Promise<void> {
    if (this._processManager === undefined) {
      return;
    }
    this._processManager.doHardStop = !(
      (await this.mergedEqualsBackupFileContents()) ||
      (this._mergeSituation !== undefined &&
        (await this.createMergedFileBackup(
          this._mergeSituation?.merged.fsPath
        )))
    );
    this._processManager.dispose();
  }

  private async askForResetByMergetoolAndBackup(): Promise<boolean> {
    if (
      this._mergeSituation === undefined ||
      this._mergeSituation.backup === undefined
    ) {
      return false;
    }
    const mergedPath = this._mergeSituation.merged.fsPath;
    if (await this.mergedEqualsBackupFileContents()) {
      return true;
    }
    if (
      this.vSCodeConfigurator.get(askToConfirmResetWhenSkippingSettingID) !==
      false
    ) {
      const resetOnceItem = { title: "Reset" };
      const resetAlwaysItem = { title: "Always reset" };
      const warningResult = await vscode.window.showWarningMessage(
        "The merged file has possibly been changed. " +
          "Continuing will reset the merged file. " +
          "A backup will be stored under “<merged file>.<date>.vsc-orig”.",
        { modal: true },
        resetOnceItem,
        resetAlwaysItem
      );
      if (warningResult === resetAlwaysItem) {
        await this.vSCodeConfigurator.set(
          askToConfirmResetWhenSkippingSettingID,
          false
        );
      } else if (warningResult !== resetOnceItem) {
        return false;
      }
    }
    if (this._mergeSituation?.merged.fsPath !== mergedPath) {
      return false;
    }
    return await this.createMergedFileBackup(mergedPath);
  }

  private async mergedEqualsBackupFileContents(): Promise<boolean> {
    if (
      this._mergeSituation === undefined ||
      this._mergeSituation.backup === undefined
    ) {
      return false;
    }
    const mergedPath = this._mergeSituation.merged.fsPath;
    const backupPath = this._mergeSituation.backup.fsPath;
    return await fileContentsEqual(mergedPath, backupPath);
  }

  private async createMergedFileBackup(mergedPath: string): Promise<boolean> {
    const newPathResult = await generateFileNameStampUntil((stamp) =>
      this.getBackupPathFromStamp(mergedPath, stamp)
    );
    if (isUIError(newPathResult)) {
      void vscode.window.showErrorMessage(newPathResult.message);
      return false;
    }
    const copyResult = await copy(mergedPath, newPathResult);
    if (isUIError(copyResult)) {
      void vscode.window.showErrorMessage(
        `Backup could not be saved: ${copyResult.message}`
      );
      return false;
    }
    return true;
  }
  private async getBackupPathFromStamp(
    mergedPath: string,
    stamp: string
  ): Promise<string | false | UIError> {
    const newPath = `${mergedPath}.${stamp}.vsc-orig`;
    const fileType = await getFileType(newPath);
    if (fileType === undefined) {
      return createUIError(`Could not ascertain file type of ${newPath}.`);
    }
    if (fileType !== FileType.notExisting) {
      return false;
    }
    return newPath;
  }

  private async reopenMergeSituationInner(): Promise<void> {
    if (this._mergeSituation === undefined) {
      void vscode.window.showErrorMessage(
        "No merge situation registered. " +
          "Try to open the *_BASE_* file manually."
      );
      return;
    }
    if (this.mergeSituationInLayout) {
      vscode.window.setStatusBarMessage(
        "Merge situation should already be displayed.",
        5000
      );
      return;
    }
    await vscode.commands.executeCommand(
      "vscode.open",
      this._mergeSituation.base
    );
  }

  private async continueMergetoolInner(): Promise<void> {
    await this.diffLayouterManager.save();
    await this.diffLayouterManager.deactivateLayout();
    this._mergeSituation = undefined;
    await this._processManager?.continue();
  }

  private async stopMergetoolWithoutDataLossInner(): Promise<boolean> {
    if (
      this._mergeSituation !== undefined &&
      this._mergeSituation.backup !== undefined &&
      !(await this.askForResetByMergetoolAndBackup())
    ) {
      return false;
    }
    await this.stopMergetoolInner();
    return true;
  }

  private async stopMergetoolInner(): Promise<void> {
    await vscode.commands.executeCommand(
      "setContext",
      gitMergetoolRunningID,
      false
    );
    await this.diffLayouterManager.deactivateLayout();
    this.disposeStatusBarItems();
    this.removeCommonMergeCommandsHandler();
    this._mergeSituation = undefined;
    if (this._processManager !== undefined) {
      void this._processManager.startStopping();
      this._processManager = undefined;
    }
  }

  private handleDidLayoutDeactivate() {
    if (this._mergeSituation !== undefined) {
      this.updateStatusBarItems();
      this.updateCommonMergeCommandsHandler();
    }
  }

  private handleDidLayoutActivate(layouter: DiffLayouter) {
    if (this._mergeSituation === undefined) {
      this._mergeSituation = this.diffLayouterManager.diffedURIs;
      layouter.setWasInitiatedByMergetool();
      if (this._mergeSituation === undefined) {
        return;
      }
    }
    this.updateStatusBarItems();
    this.updateCommonMergeCommandsHandler();
  }

  private async handleMergetoolStop(
    processManager: MergetoolProcessManager,
    success: boolean
  ) {
    await this.monitor.enter();
    try {
      if (this._processManager !== processManager) {
        return;
      }
      await this.diffLayouterManager.deactivateLayout();
      await this.stopMergetoolInner();
      if (success) {
        await this.jumpToCommitMsg();
      }
    } finally {
      await this.monitor.leave();
    }
  }

  private async jumpToCommitMsg() {
    await vscode.commands.executeCommand("workbench.scm.focus");
    if (
      this.vSCodeConfigurator.get(editCommitMessageAfterMergetoolSettingID)
    ) {
      const workspaceRoot = getWorkingDirectoryUriInteractively();
      if (workspaceRoot !== undefined) {
        const commitMessagePath = vscode.Uri.joinPath(
          workspaceRoot,
          ".git/MERGE_MSG"
        );
        if (
          (await getFileType(commitMessagePath.fsPath)) === FileType.regular
        ) {
          await vscode.commands.executeCommand(
            "vscode.open",
            commitMessagePath
          );
        }
      }
    }
  }

  private assertMergetoolActiveInteractively(): boolean {
    if (!this._processManager?.isRunning) {
      void vscode.window.showErrorMessage(
        "There is no running `git mergetool` process which " +
          "is controlled by VS Code."
      );
      return false;
    }
    if (!this._processManager.isAvailable) {
      void vscode.window.showErrorMessage(
        "The `git mergetool` process is currently stopping."
      );
      return false;
    }
    return true;
  }

  private assertMergeSituationOpenedInteractively(): boolean {
    if (!this.mergeSituationInLayout) {
      void vscode.window.showErrorMessage(
        "You need to have the merge situation opened."
      );
      return false;
    }
    return true;
  }

  private disposeStatusBarItems() {
    this.statusBarItems?.forEach((item) => item.dispose());
    this.statusBarItems = undefined;
  }

  private updateStatusBarItems() {
    this.disposeStatusBarItems();
    const showLabel =
      this.vSCodeConfigurator.get(labelsInStatusBarSettingID) === true;
    this.statusBarItems = [];
    if (this._processManager?.isAvailable !== true) {
      return;
    }
    this.statusBarItems.push(
      this.createStatusBarItem("$(git-merge) Git Mergetool:", 15)
    );
    if (this._mergeSituation !== undefined) {
      if (this.mergeSituationInLayout) {
        this.statusBarItems.push(
          this.createStatusBarItem(
            "$(check)" + (showLabel ? "Next step" : ""),
            14,
            nextMergeStepCommandID,
            "Go to next conflict, next file, or commit message"
          )
        );
        this.statusBarItems.push(
          this.createStatusBarItem(
            "$(live-share)" + (showLabel ? " Skip file" : ""),
            13,
            gitMergetoolSkipCommandID,
            "Leave current file as is and continue merging other files"
          )
        );
      } else {
        this.statusBarItems.push(
          this.createStatusBarItem(
            "$(diff)" + (showLabel ? " Reopen" : ""),
            14,
            gitMergetoolMergeSituationCommandID,
            "Reopen the merge situation"
          )
        );
      }
    }
    this.statusBarItems.push(
      this.createStatusBarItem(
        "$(stop)" + (showLabel ? " Stop" : ""),
        12,
        gitMergetoolStopCommandID,
        "Stop `git mergetool`"
      )
    );
  }

  private createStatusBarItem(
    text: string,
    priority: number,
    command?: string,
    tooltip?: string
  ) {
    const result = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      priority
    );
    result.text = text;
    result.command = command;
    result.color = MergetoolUI.statusBarItemColor;
    result.tooltip = tooltip;
    result.show();
    return result;
  }
  private removeCommonMergeCommandsHandler(): void {
    this.commonMergeCommandsManager.removeHandler(this);
  }
  private updateCommonMergeCommandsHandler(): void {
    this.removeCommonMergeCommandsHandler();
    if (this._mergeSituation !== undefined) {
      this.registeredDisposables.add(
        this.commonMergeCommandsManager.addHandler(this)
      );
    }
  }
}

export const gitMergetoolRunningID = `${extensionID}.gitMergetoolRunning`;
export const gitMergetoolStartCommandID = `${extensionID}.gitMergetoolStart`;
export const gitMergetoolSkipCommandID = `${extensionID}.gitMergetoolSkip`;
export const gitMergetoolMergeSituationCommandID = `${extensionID}.gitMergetoolReopenMergeSituation`;
export const gitMergeAbortCommandID = `${extensionID}.gitMergeAbort`;
export const gitCommitCommandID = `${extensionID}.commit`;
export const editCommitMessageAfterMergetoolSettingID = `${extensionID}.editCommitMessageAfterMergetool`;
export const askToConfirmResetWhenSkippingSettingID = `${extensionID}.askToConfirmResetWhenSkipping`;
