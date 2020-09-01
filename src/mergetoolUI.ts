import * as vscode from "vscode";
import { createBackgroundGitTerminal } from "./backgroundGitTerminal";
import { DiffedURIs } from "./diffedURIs";
import { DiffLayouterManager } from "./diffLayouterManager";
import { fileContentsEqual, FileType, getFileType, move } from "./fsAsync";
import { getWorkingDirectoryUriInteractively } from "./getPaths";
import { extensionID, labelsInStatusBarSettingID } from "./iDs";
import { DiffLayouter, SearchType } from "./layouters/diffLayouter";
import { MergetoolProcessManager } from "./mergetoolProcessManager";
import { Monitor } from "./monitor";
import { defaultVSCodeConfigurator } from "./vSCodeConfigurator";

export class MergetoolUI {
  public register(): void {
    const commands: [string, () => unknown][] = [
      /* eslint-disable @typescript-eslint/unbound-method */
      [gitMergetoolStartCommandID, this.startMergetool],
      [gitMergetoolContinueCommandID, this.continueMergetool],
      [gitMergetoolSkipCommandID, this.skipFile],
      [gitMergetoolStopCommandID, this.stopMergetoolInteractively],
      [gitMergetoolMergeSituationCommandID, this.reopenMergeSituation],
      [gitMergeAbortCommandID, this.abortMerge],
      [gitCommitCommandID, this.commitActiveCommitMessage],
      [nextMergeStepCommandID, this.doNextStepInMergeProcess],
      /* eslint-enable @typescript-eslint/unbound-method */
    ];
    for (const [commandID, handler] of commands) {
      this.registeredDisposables.push(
        vscode.commands.registerCommand(commandID, handler.bind(this))
      );
    }
    this.registeredDisposables.push(
      this.diffLayouterManager.onDidLayoutDeactivate(
        this.handleDidLayoutDeactivate.bind(this)
      ),
      this.diffLayouterManager.onDidLayoutActivate(
        this.handleDidLayoutActivate.bind(this)
      ),
      this.diffLayouterManager.onDidLayoutReact(() => {
        this.processManager?.setMergetoolReacted();
      })
    );
  }

  public async startMergetool(): Promise<void> {
    if (!this.checkMonitorNotInUse()) {
      return;
    }
    await this.monitor.enter();
    try {
      if (this.processManager?.isRunning === true) {
        if (this.mergeSituation !== undefined) {
          await this.reopenMergeSituationInner();
        }
        return;
      }
      if (this.processManager !== undefined) {
        return;
      }
      const newProcessManager = new MergetoolProcessManager();
      newProcessManager.onDidStop((success) =>
        this.handleMergetoolStop(newProcessManager, success)
      );
      if (!(await newProcessManager.start())) {
        return;
      }
      this.processManager = newProcessManager;
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

  public async continueMergetool(): Promise<void> {
    if (!this.checkMonitorNotInUse()) {
      return;
    }
    await this.monitor.enter();
    try {
      // eslint-disable-next-line no-constant-condition
      if (
        !this.assertMergetoolActiveInteractively() ||
        !this.assertMergeSituationOpenedInteractively()
      ) {
        return;
      }
      const focusResult = this.diffLayouterManager.focusMergeConflict(
        SearchType.first
      );
      if (focusResult === undefined) {
        void vscode.window.showErrorMessage(
          "Cannot retrieve merged file contents."
        );
        return;
      }
      if (!focusResult) {
        await this.continueMergetoolInner();
        return;
      }
    } finally {
      await this.monitor.leave();
    }
    const situation = this.mergeSituation;
    const cancel = "Cancel";
    const acceptIncludedIndicators = "Accept included indicators";
    const result = await vscode.window.showWarningMessage(
      "Merged file contains Git merge conflict indicators.",
      cancel,
      acceptIncludedIndicators
    );
    if (result !== acceptIncludedIndicators) {
      return;
    }
    await this.monitor.enter();
    try {
      if (
        situation === undefined ||
        this.mergeSituation?.equals(situation) !== true
      ) {
        void vscode.window.showErrorMessage(
          "The situation has changed. Reopen the situation and try again."
        );
        return;
      }
      if (
        !this.assertMergetoolActiveInteractively() ||
        !this.assertMergeSituationOpenedInteractively()
      ) {
        return;
      }
      await this.continueMergetoolInner();
    } finally {
      await this.monitor.leave();
    }
  }

  public async stopMergetoolInteractively(): Promise<void> {
    if (!this.checkMonitorNotInUse()) {
      return;
    }
    await this.monitor.enter();
    try {
      if (!this.assertMergetoolActiveInteractively()) {
        return;
      }
      await this.stopMergetoolInner();
    } finally {
      await this.monitor.leave();
    }
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
      if (this.processManager?.isAvailable) {
        await this.stopMergetoolInner();
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
      const term = await createBackgroundGitTerminal({
        shellArgs: ["commit", "--no-edit", `--file=${document.fileName}`],
      });
      term?.show(true);
      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
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
        this.mergeSituation?.backup === undefined
      ) {
        return;
      }
      await this.diffLayouterManager.save();
      const mergedPath = this.mergeSituation.merged.fsPath;
      const backupPath = this.mergeSituation.backup.fsPath;
      if (!(await fileContentsEqual(mergedPath, backupPath))) {
        if (
          this.vSCodeConfigurator.get(
            askToConfirmResetWhenSkippingSettingID
          ) !== false
        ) {
          const resetOnceItem = { title: "Reset" };
          const resetAlwaysItem = { title: "Always reset" };
          const cancelItem = { title: "Cancel" };
          const warningResult = await vscode.window.showWarningMessage(
            "The merged file has possibly been changed. " +
              "Continuing will reset the merged file. " +
              "A backup will be stored under “<merged file>.<date>.orig”.",
            resetOnceItem,
            resetAlwaysItem,
            cancelItem
          );
          if (warningResult === resetAlwaysItem) {
            await this.vSCodeConfigurator.set(
              askToConfirmResetWhenSkippingSettingID,
              false
            );
          } else if (warningResult !== resetOnceItem) {
            return;
          }
        }
        if (this.mergeSituation?.backup !== undefined) {
          const newPath = `${mergedPath}.${new Date()
            .toISOString()
            .replace(/[.:]/g, "-")}.orig`;
          if (!(await move(mergedPath, newPath))) {
            void vscode.window.showErrorMessage("Backup could not be saved.");
            return;
          }
        }
      }
      await this.diffLayouterManager.deactivateLayout();
      this.mergeSituation = undefined;
      await this.processManager?.skip();
    } finally {
      await this.monitor.leave();
    }
  }

  public async doNextStepInMergeProcess(): Promise<void> {
    if (!this.checkMonitorNotInUse()) {
      return;
    }
    const document = vscode.window.activeTextEditor?.document;
    if (document?.languageId === "git-commit") {
      await this.commitActiveCommitMessage();
      return;
    }
    if (!this.mergeSituationInLayout) {
      await this.startMergetool();
      return;
    }
    const focusResult = this.diffLayouterManager.focusMergeConflict(
      SearchType.next
    );
    if (focusResult !== true) {
      await this.continueMergetool();
      return;
    }
  }

  public dispose(): void {
    this.registeredDisposables.forEach((item) => void item?.dispose());
    this.registeredDisposables = [];
    this.processManager?.dispose();
  }

  public constructor(
    private readonly diffLayouterManager: DiffLayouterManager,
    private readonly vSCodeConfigurator = defaultVSCodeConfigurator,
    private readonly monitor = new Monitor()
  ) {}

  /**
   * implies `mergetoolRunning`
   */
  private statusBarItems: vscode.StatusBarItem[] | undefined;
  private static readonly statusBarItemColor = new vscode.ThemeColor(
    "statusBar.foreground"
  );
  private mergeSituation: DiffedURIs | undefined;
  private processManager: MergetoolProcessManager | undefined;
  private registeredDisposables: (vscode.Disposable | undefined)[] = [];

  private checkMonitorNotInUse(): boolean {
    if (this.monitor.inUse) {
      void vscode.window.showErrorMessage(
        "Another operation is pending. Please try again later."
      );
      return false;
    }
    return true;
  }

  private async reopenMergeSituationInner(): Promise<void> {
    if (this.mergeSituation === undefined) {
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
      this.mergeSituation.base
    );
  }

  private async continueMergetoolInner(): Promise<void> {
    await this.diffLayouterManager.save();
    await this.diffLayouterManager.deactivateLayout();
    this.mergeSituation = undefined;
    await this.processManager?.continue();
  }

  private async stopMergetoolInner(): Promise<void> {
    await vscode.commands.executeCommand(
      "setContext",
      gitMergetoolRunningID,
      false
    );
    await this.diffLayouterManager.deactivateLayout();
    this.disposeStatusBarItems();
    this.mergeSituation = undefined;
    if (this.processManager !== undefined) {
      void this.processManager.startStopping();
      this.processManager = undefined;
    }
  }

  private get mergeSituationInLayout(): boolean {
    return (
      this.mergeSituation !== undefined &&
      this.diffLayouterManager.diffedURIs?.equals(this.mergeSituation) === true
    );
  }

  private handleDidLayoutDeactivate() {
    if (this.mergeSituation !== undefined) {
      this.updateStatusBarItems();
    }
  }

  private handleDidLayoutActivate(layouter: DiffLayouter) {
    if (this.mergeSituation === undefined) {
      this.mergeSituation = this.diffLayouterManager.diffedURIs;
      layouter.setWasInitiatedByMergetool();
      if (this.mergeSituation !== undefined) {
        this.updateStatusBarItems();
      }
    } else {
      this.updateStatusBarItems();
    }
  }

  private async handleMergetoolStop(
    processManager: MergetoolProcessManager,
    success: boolean
  ) {
    await this.monitor.enter();
    try {
      if (this.processManager !== processManager) {
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
      defaultVSCodeConfigurator.get(editCommitMessageAfterMergetoolSettingID)
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
    if (!this.processManager?.isRunning) {
      void vscode.window.showErrorMessage(
        "There is no running `git mergetool` process which " +
          "is controlled by VS Code."
      );
      return false;
    }
    if (!this.processManager.isAvailable) {
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
    if (this.processManager?.isAvailable !== true) {
      return;
    }
    this.statusBarItems.push(
      this.createStatusBarItem("$(git-merge) Git Mergetool:", 15)
    );
    if (this.mergeSituation !== undefined) {
      if (this.mergeSituationInLayout) {
        this.statusBarItems.push(
          this.createStatusBarItem(
            "$(check)" + (showLabel ? " Accept file" : ""),
            14,
            gitMergetoolContinueCommandID,
            "Consider current file merged and continue"
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
}

export const gitMergetoolRunningID = `${extensionID}.gitMergetoolRunning`;
const gitMergetoolStartCommandID = `${extensionID}.gitMergetoolStart`;
const gitMergetoolContinueCommandID = `${extensionID}.gitMergetoolContinue`;
const gitMergetoolSkipCommandID = `${extensionID}.gitMergetoolSkip`;
const gitMergetoolStopCommandID = `${extensionID}.gitMergetoolStop`;
const gitMergetoolMergeSituationCommandID = `${extensionID}.gitMergetoolReopenMergeSituation`;
const gitMergeAbortCommandID = `${extensionID}.gitMergeAbort`;
const gitCommitCommandID = `${extensionID}.commit`;
const nextMergeStepCommandID = `${extensionID}.nextMergeStep`;
const editCommitMessageAfterMergetoolSettingID = `${extensionID}.editCommitMessageAfterMergetool`;
const askToConfirmResetWhenSkippingSettingID = `${extensionID}.askToConfirmResetWhenSkipping`;
