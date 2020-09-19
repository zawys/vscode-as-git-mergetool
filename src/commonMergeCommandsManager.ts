// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { commands, Disposable } from "vscode";
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
    for (const handler of this.handlers) {
      handler.continueMergeProcess();
    }
  }
  private handleStopCommand(): void {
    for (const handler of this.handlers) {
      handler.stopMergeProcess();
    }
  }
  private handleNextMergeStepCommand(): void {
    for (const handler of this.handlers) {
      handler.doNextStepInMergeProcess();
    }
  }
}

export const gitMergetoolContinueCommandID = `${extensionID}.gitMergetoolContinue`;
export const gitMergetoolStopCommandID = `${extensionID}.gitMergetoolStop`;
export const nextMergeStepCommandID = `${extensionID}.nextMergeStep`;

export interface CommonMergeCommandHandler {
  stopMergeProcess(): void;
  continueMergeProcess(): void;
  doNextStepInMergeProcess(): void;
}
