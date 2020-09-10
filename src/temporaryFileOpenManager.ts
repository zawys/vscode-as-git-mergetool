// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { Event, EventEmitter, Uri } from "vscode";
import { filesExist, getDiffedURIs } from "./diffedURIs";
import { DiffLayouterManager } from "./diffLayouterManager";

export class TemporaryFileOpenManager {
  public get onDidLayoutReact(): Event<void> {
    return this.didMergetoolReact.event;
  }
  public async handleDidOpenURI(uRI: Uri): Promise<boolean> {
    if (this.diffLayouterManager.layoutSwitchInProgress) {
      return false;
    }
    const diffedURIs = getDiffedURIs(uRI);
    if (diffedURIs === undefined || !(await filesExist(diffedURIs))) {
      return false;
    }
    if (this.diffLayouterManager.layoutSwitchInProgress) {
      return false;
    }
    this.didMergetoolReact.fire();
    return await this.diffLayouterManager.openDiffedURIs(diffedURIs, true);
  }
  public constructor(
    private readonly diffLayouterManager: DiffLayouterManager
  ) {}
  private readonly didMergetoolReact = new EventEmitter<void>();
}
