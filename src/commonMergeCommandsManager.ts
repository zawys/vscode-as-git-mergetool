// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { commands, Disposable, window } from "vscode";
import { extensionID } from "./iDs";
import { RegisterableService } from "./registerableService";

export class CommonMergeCommandsManager implements RegisterableService {
  public addHandler(handler: CommonMergeCommandHandler): Disposable {
    this.handlers.add(handler);
    return new Disposable(() => {
      this.removeHandler(handler);
    });
  }
  public register(): void | Promise<void> {
    this.disposables.push(
      commands.registerCommand(
        gitMergetoolContinueCommandID,
        this.handleContinueCommand.bind(this)
      ),
      commands.registerCommand(
        gitMergetoolStopCommandID,
        this.handleStopCommand.bind(this)
      ),
      commands.registerCommand(
        nextMergeStepCommandID,
        this.handleNextMergeStepCommand.bind(this)
      )
    );
  }
  public dispose(): void {
    this.handlers = new Set();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
  public removeHandler(handler: CommonMergeCommandHandler): void {
    this.handlers.add(handler);
  }
  private disposables: Disposable[] = [];
  private handlers = new Set<CommonMergeCommandHandler>();
  private handleContinueCommand(): void {
    void this.handleCommand((handler) => handler.continueMergeProcess());
  }
  private handleStopCommand(): void {
    void this.handleCommand((handler) => handler.stopMergeProcess());
  }
  private handleNextMergeStepCommand(): void {
    void this.handleCommand((handler) => handler.doNextStepInMergeProcess());
  }
  private async handleCommand(
    action: (handler: CommonMergeCommandHandler) => boolean | Promise<boolean>
  ): Promise<void> {
    for (const handler of this.handlers) {
      if (await action(handler)) {
        return;
      }
    }
    void window.showErrorMessage(
      "Command not applicable in the current situation"
    );
  }
}

export const gitMergetoolContinueCommandID = `${extensionID}.gitMergetoolContinue`;
export const gitMergetoolStopCommandID = `${extensionID}.gitMergetoolStop`;
export const nextMergeStepCommandID = `${extensionID}.nextMergeStep`;

export interface CommonMergeCommandHandler {
  stopMergeProcess(): boolean | Promise<boolean>;
  continueMergeProcess(): boolean | Promise<boolean>;
  doNextStepInMergeProcess(): boolean | Promise<boolean>;
}
