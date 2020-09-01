import * as cp from "child_process";
import * as process from "process";
import * as vscode from "vscode";
import { Disposable, Event, EventEmitter } from "vscode";
import {
  getGitPathInteractively,
  getWorkingDirectoryUriInteractively,
} from "./getPaths";
import { TerminalProcessManager } from "./terminalProcessManager";

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
    const options = ["mergetool"];
    const childProcess = cp.spawn(gitPath, options, {
      cwd: workingDirectory.fsPath,
      env: {
        ...process.env,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ELECTRON_RUN_AS_NODE: undefined,
      },
    });
    this.processManager = new TerminalProcessManager(childProcess, false);
    this.processManager.onWasCloseRequested(() => {
      void this.startStopping(false);
    });
    this.processManager.onDidTerminate(this.handleTermination.bind(this));
    this.processManager.register();
    this.terminal = vscode.window.createTerminal({
      name: ["git", ...options].join(" "),
      pty: this.processManager,
    });
    if (this.terminal === undefined) {
      void vscode.window.showErrorMessage("Failed to create a terminal.");
      await this.startStopping(false);
      return false;
    }
    return true;
  }

  public async continue(): Promise<void> {
    if (!this.isAvailable) {
      return;
    }
    await this.processManager?.handleInput("y\n");
  }

  public async skip(): Promise<void> {
    if (!this.isAvailable) {
      return;
    }
    await this.processManager?.handleInput("n\ny\n");
  }

  public async startStopping(showTerminal = true): Promise<void> {
    if (!this.isAvailable) {
      return;
    }
    this._isStopping = true;
    if (showTerminal) {
      this.terminal?.show();
    }
    this.stopStatusMessage = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      15
    );
    this.stopStatusMessage.text = "Stopping `git mergetool`…";
    this.stopStatusMessage.color = MergetoolProcessManager.statusBarItemColor;
    this.stopStatusMessage.show();
    await this.processManager?.handleInput("n\nn\n");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.processManager?.startTermination();
  }

  public get isInitial(): boolean {
    return !this.disposed && this.processManager === undefined;
  }
  public get isAvailable(): boolean {
    return this.isRunning && !this.isStopping;
  }
  /**
   * = available || stopping
   */
  public get isRunning(): boolean {
    return this.processManager?.isRunning === true;
  }
  public get isStopping(): boolean {
    return this._isStopping;
  }
  public get isDisposed(): boolean {
    return this.disposed;
  }
  public get wasSuccessful(): boolean | undefined {
    return this.success;
  }

  public get onDidStop(): Event<boolean> {
    return this.didStop.event;
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.stopStatusMessage?.dispose();
    this.terminal?.dispose();
    this.terminal = undefined;
    this.processManager?.dispose();
    this.processManager = undefined;
    this._isStopping = false;
    this.disposed = true;
    this.didStop.fire(this.success);
    this.didStop.dispose();
  }

  private processManager: TerminalProcessManager | undefined;
  private terminal: vscode.Terminal | undefined;
  private _isStopping = false;
  private disposed = false;
  private didStop = new EventEmitter<boolean>();
  private stopStatusMessage: vscode.StatusBarItem | undefined;
  private success = false;
  private static readonly statusBarItemColor = new vscode.ThemeColor(
    "statusBar.foreground"
  );

  private handleTermination(code: number | undefined) {
    if (code === undefined) {
      void vscode.window.showWarningMessage(
        `\`git mergetool\` exited with unknown exit status.`
      );
    } else if (code !== 0) {
      void vscode.window.showErrorMessage(
        `\`git mergetool\` returned ${code}`
      );
    } else {
      vscode.window.setStatusBarMessage("`git mergetool` succeeded.", 5000);
      this.success = true;
    }
    this.dispose();
  }
}
