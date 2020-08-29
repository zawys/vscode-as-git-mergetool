import * as vscode from "vscode";
import { createBackgroundGitTerminal } from "./backgroundGitTerminal";
import { DiffedURIs, uRIsOrUndefEqual } from "./diffedURIs";
import { DiffLayouter, SearchType } from "./layouters/diffLayouter";
import { DiffLayoutManager } from "./diffLayoutManager";
import { extensionID, labelsInStatusBarSettingID } from "./iDs";
import { FileType, getFileType } from "./fsAsync";
import { getWorkingDirectoryUri } from "./getPaths";
import { defaultVSCodeConfigurator } from "./vSCodeConfigurator";

export class MergetoolProcess {
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
      /* eslint-enable @typescript-eslint/unbound-method */
    ];
    for (const [commandID, handler] of commands) {
      this.registeredDisposables.push(
        vscode.commands.registerCommand(commandID, handler.bind(this))
      );
    }
    this.registeredDisposables.push(
      this.diffLayoutManager.onDidLayoutDeactivate(
        this.handleDidLayoutDeactivate.bind(this)
      ),
      this.diffLayoutManager.onDidLayoutActivate(
        this.handleDidLayoutActivate.bind(this)
      )
    );
  }

  public async startMergetool(): Promise<void> {
    if (this.mergetoolRunning) {
      await this.reopenMergeSituation();
      return;
    }
    this.mergetoolRunning = true;
    this.mergetoolTerm = await createBackgroundGitTerminal({
      shellArgs: ["mergetool"],
      env: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        LANG: "POSIX",
      },
    });
    if (this.mergetoolTerm === undefined) {
      return;
    }
    this.termCloseListener = vscode.window.onDidCloseTerminal(
      this.handleMergetoolTerminalClose.bind(this)
    );
    await vscode.commands.executeCommand(
      "setContext",
      gitMergetoolRunningID,
      true
    );
    this.updateStatusBarItems();
    // layout launches automatically by detecting an opened *_BASE_* file
  }

  public async continueMergetool(): Promise<void> {
    let acceptIndicators = false;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (
        !this.assertMergetoolActiveInteractively() ||
        !this.assertMergeSituationOpenedInteractively()
      ) {
        return;
      }
      const focusResult = this.diffLayoutManager.focusMergeConflict(
        SearchType.first
      );
      if (focusResult === undefined) {
        void vscode.window.showErrorMessage(
          "Cannot retrieve merged file contents."
        );
        return;
      }
      if (!acceptIndicators && focusResult !== false) {
        const cancel = "Cancel";
        const acceptIncludedIndicators = "Accept included indicators";
        const result = await vscode.window.showErrorMessage(
          "Merged file contains Git merge conflict indicators.",
          cancel,
          acceptIncludedIndicators
        );
        if (result !== acceptIncludedIndicators) {
          return;
        } else {
          acceptIndicators = true;
          continue;
        }
      }
      break;
    }
    await this.diffLayoutManager.save();
    await this.diffLayoutManager.deactivateLayout();
    this.mergeSituation = undefined;
    this.mergetoolTerm?.sendText("y\n");
  }

  public async skipFile(): Promise<void> {
    if (
      !this.assertMergetoolActiveInteractively() ||
      !this.assertMergeSituationOpenedInteractively()
    ) {
      return;
    }
    await this.diffLayoutManager.save();
    await this.diffLayoutManager.deactivateLayout();
    this.mergeSituation = undefined;
    this.mergetoolTerm?.sendText("n\ny\n");
  }

  public async stopMergetoolInteractively(): Promise<void> {
    if (!this.assertMergetoolActiveInteractively()) {
      return;
    }
    await this.stopMergetool();
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
    if (this.mergetoolRunning && !this.mergetoolStopping) {
      await this.stopMergetool();
    }
    await createBackgroundGitTerminal({
      shellArgs: ["merge", pickedItem === abortMerge ? "--abort" : "--quit"],
    });
  }

  public async commitActiveCommitMessage(): Promise<void> {
    const document = vscode.window.activeTextEditor?.document;
    if (document?.languageId !== "git-commit") {
      return;
    }
    await document.save();
    const term = await createBackgroundGitTerminal({
      shellArgs: ["commit", "--no-edit", `--file=${document.fileName}`],
    });
    term?.show(true);
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }

  public async reopenMergeSituation(): Promise<void> {
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

  public async stopMergetool(): Promise<void> {
    this.mergetoolStopping = true;
    await vscode.commands.executeCommand(
      "setContext",
      gitMergetoolRunningID,
      false
    );
    await this.diffLayoutManager.deactivateLayout();
    this.termCloseListener?.dispose();
    this.termCloseListener = undefined;
    this.disposeStatusBarItems();
    this.mergeSituation = undefined;
    if (this.mergetoolTerm !== undefined) {
      const stopStatusMessage = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        15
      );
      stopStatusMessage.text = "Stopping `git mergetool`…";
      stopStatusMessage.color = MergetoolProcess.statusBarItemColor;
      stopStatusMessage.show();
      this.mergetoolTerm.sendText("n\nn\n");
      this.mergetoolTerm.show();
      const term = this.mergetoolTerm;
      await new Promise((resolve) => {
        this.stopMergetoolListener = vscode.window.onDidCloseTerminal((t) => {
          if (term === t) {
            resolve();
          }
        });
      });
      this.mergetoolTerm.dispose();
      this.mergetoolTerm = undefined;
      this.stopMergetoolListener?.dispose();
      this.stopMergetoolListener = undefined;
      stopStatusMessage.dispose();
    }
    this.mergetoolRunning = false;
    this.mergetoolStopping = false;
  }

  public async dispose(): Promise<void> {
    await this.stopMergetool();
    this.registeredDisposables.forEach((item) => void item.dispose());
    this.registeredDisposables = [];
  }

  public constructor(
    private readonly diffLayoutManager: DiffLayoutManager,
    private readonly vSCodeConfigurator = defaultVSCodeConfigurator
  ) {}

  private mergetoolRunning = false;
  /**
   * implies `mergetoolRunning`
   */
  private mergetoolStopping = false;
  private mergetoolTerm: vscode.Terminal | undefined = undefined;
  private termCloseListener: vscode.Disposable | undefined = undefined;
  private statusBarItems: vscode.StatusBarItem[] | undefined = undefined;
  private stopMergetoolListener: vscode.Disposable | undefined = undefined;
  private static readonly statusBarItemColor = new vscode.ThemeColor(
    "statusBar.foreground"
  );
  private mergeSituation: DiffedURIs | undefined = undefined;
  private registeredDisposables: vscode.Disposable[] = [];

  private get mergeSituationInLayout(): boolean {
    return (
      this.mergeSituation !== undefined &&
      this.diffLayoutManager.diffedURIs !== undefined &&
      uRIsOrUndefEqual(
        this.mergeSituation.base,
        this.diffLayoutManager.diffedURIs.base
      )
    );
  }

  private handleDidLayoutDeactivate() {
    if (this.mergeSituation !== undefined) {
      this.updateStatusBarItems();
    }
  }

  private handleDidLayoutActivate(layouter: DiffLayouter) {
    if (this.mergeSituation === undefined) {
      this.mergeSituation = this.diffLayoutManager.diffedURIs;
      layouter.setWasInitiatedByMergetool();
      if (this.mergeSituation !== undefined) {
        this.updateStatusBarItems();
      }
    } else {
      this.updateStatusBarItems();
    }
  }

  private async handleMergetoolTerminalClose(closedTerminal: vscode.Terminal) {
    if (closedTerminal !== this.mergetoolTerm || this.mergetoolStopping) {
      return;
    }
    if (closedTerminal.exitStatus?.code === undefined) {
      void vscode.window.showWarningMessage(
        `\`git mergetool\` exited with unknown exit status.`
      );
    } else if (closedTerminal.exitStatus?.code !== 0) {
      const returnCode = closedTerminal.exitStatus?.code;
      void vscode.window.showErrorMessage(
        `\`git mergetool\` returned ${returnCode}`
      );
    } else {
      vscode.window.setStatusBarMessage("`git mergetool` succeeded.", 15000);
      await this.diffLayoutManager.deactivateLayout();
      await this.jumpToCommitMsg();
    }
    this.mergetoolTerm?.dispose();
    this.mergetoolTerm = undefined;
    await this.stopMergetool();
  }

  private async jumpToCommitMsg() {
    await vscode.commands.executeCommand("workbench.scm.focus");
    if (
      defaultVSCodeConfigurator.get(editCommitMessageAfterMergetoolSettingID)
    ) {
      const workspaceRoot = getWorkingDirectoryUri();
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
    if (!this.mergetoolRunning) {
      void vscode.window.showErrorMessage(
        "There is no running `git mergetool` process which " +
          "is controlled by VS Code."
      );
      return false;
    }
    if (this.mergetoolStopping) {
      void vscode.window.showErrorMessage(
        "The `git mergetool` process is currently stopping."
      );
      return false;
    }
    return true;
  }

  private assertMergeSituationOpenedInteractively(): boolean {
    if (!this.mergeSituationInLayout || this.mergeSituation === undefined) {
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
    if (!this.mergetoolRunning || this.mergetoolStopping) {
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
    result.color = MergetoolProcess.statusBarItemColor;
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
const editCommitMessageAfterMergetoolSettingID = `${extensionID}.editCommitMessageAfterMergetool`;
