import * as process from "process";
import * as vscode from "vscode";
import { Disposable, Event, EventEmitter } from "vscode";
import {
  getGitPathInteractively,
  getWorkingDirectoryUriInteractively,
} from "./getPathsWithinVSCode";
import {
  getCoreNodeModuleInteractively,
  TerminalProcessManager,
} from "./terminalProcessManager";

export class MergetoolProcessManager implements Disposable {
  public async start(): Promise<boolean> {
    if (!this.isInitial) {
      return false;
    }
    const gitPath = await getGitPathInteractively();
    if (gitPath === undefined || !this.isInitial) {
      return false;
    }
    const workingDirectory = getWorkingDirectoryUriInteractively();
    if (workingDirectory === undefined) {
      return false;
    }
    const nodePtyResult = getCoreNodeModuleInteractively("node-pty");
    if (nodePtyResult === undefined) {
      return false;
    }
    const arguments_ = ["mergetool"];
    this.processManager = new TerminalProcessManager(
      nodePtyResult as typeof import("node-pty"),
      gitPath,
      arguments_,
      {
        cwd: workingDirectory.fsPath,
        env: {
          ...process.env,
          // eslint-disable-next-line @typescript-eslint/naming-convention
          ELECTRON_RUN_AS_NODE: "",
        },
      },
      false
    );
    this.processManager.onWasCloseRequested(() => {
      void this.startStopping(false);
    });
    this.processManager.onDidTerminate(this.handleTermination.bind(this));
    this.processManager.start();
    this._terminal = vscode.window.createTerminal({
      name: ["git", ...arguments_].join(" "),
      pty: this.processManager,
    });
    if (this._terminal === undefined) {
      void vscode.window.showErrorMessage("Failed to create a terminal.");
      await this.startStopping(false);
      return false;
    }
    this.setReactionTimeout();
    return true;
  }

  public async continue(): Promise<void> {
    if (!this.isAvailable) {
      return;
    }
    this.setReactionTimeout();
    await this.processManager?.handleInput("y\n");
  }

  public async skip(): Promise<void> {
    if (!this.isAvailable) {
      return;
    }
    this.setReactionTimeout();
    await this.processManager?.handleInput("n\ny\n");
  }

  public async startStopping(showTerminal = true): Promise<void> {
    if (!this.isAvailable) {
      return;
    }
    this._isStopping = true;
    if (showTerminal) {
      this._terminal?.show();
    }
    this.stopStatusMessage = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      15
    );
    this.stopStatusMessage.text = "Stopping `git mergetool`…";
    this.stopStatusMessage.color = MergetoolProcessManager.statusBarItemColor;
    this.stopStatusMessage.show();
    this.setReactionTimeout();
    await this.startStoppingNoUI();
  }

  public setMergetoolReacted(): void {
    this.clearReactionTimeout();
  }

  public get isInitial(): boolean {
    return !this.disposing && this.processManager === undefined;
  }
  public get isAvailable(): boolean {
    return this.isRunning && !this.isStopping;
  }
  public get isRunning(): boolean {
    return this.processManager?.isRunning === true;
  }
  public get isStopping(): boolean {
    return this._isStopping;
  }
  public get wasSuccessful(): boolean | undefined {
    return this.success;
  }

  public get onDidStop(): Event<boolean> {
    return this.didStop.event;
  }

  public doHardStop = false;

  public dispose(): void {
    if (this.disposing) {
      return;
    }
    this.disposing = true;
    this.stopStatusMessage?.dispose();
    this._terminal?.dispose();
    this._terminal = undefined;
    this.didStop.dispose();
    this.clearReactionTimeout();
    if (!this._isStopping) {
      this._isStopping = true;
      void this.startStoppingNoUI();
    }
  }

  private processManager: TerminalProcessManager | undefined;
  private _terminal: vscode.Terminal | undefined;
  private _isStopping = false;
  private disposing = false;
  private didStop = new EventEmitter<boolean>();
  private stopStatusMessage: vscode.StatusBarItem | undefined;
  private success = false;
  private static readonly statusBarItemColor = new vscode.ThemeColor(
    "statusBar.foreground"
  );
  private readonly reactionTimeoutHandler = this.handleReactionTimeout.bind(
    this
  );
  private reactionTimeout: NodeJS.Timeout | undefined;

  private async startStoppingNoUI(): Promise<void> {
    if (!this.doHardStop) {
      await this.processManager?.handleInput("n\nn\n");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    this.processManager?.startTermination();
  }

  private handleTermination(code: number | undefined) {
    this._isStopping = false;
    if (!this.disposing) {
      this.setMergetoolReacted();
      if (code === undefined) {
        void vscode.window.showWarningMessage(
          `\`git mergetool\` exited with unknown exit status.`
        );
      } else if (code !== 0) {
        void vscode.window.showErrorMessage(
          `\`git mergetool\` exited with code ${code}`
        );
      } else {
        vscode.window.setStatusBarMessage("`git mergetool` succeeded.", 5000);
        this.success = true;
      }
      this.didStop.fire(this.success);
      this.dispose();
    }
    this.processManager?.dispose();
    this.processManager = undefined;
  }
  private setReactionTimeout() {
    this.clearReactionTimeout();
    this.reactionTimeout = setTimeout(this.reactionTimeoutHandler, 1500);
  }
  private handleReactionTimeout() {
    this._terminal?.show();
  }
  private clearReactionTimeout() {
    if (this.reactionTimeout !== undefined) {
      clearTimeout(this.reactionTimeout);
    }
  }
}
