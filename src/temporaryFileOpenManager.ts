// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { Event, EventEmitter, Uri } from "vscode";
import {
  toURIList,
  DiffedURIs,
  parseBaseFileNameRE,
  fsPathOccursIn,
} from "./diffedURIs";
import { DiffLayouterManager } from "./diffLayouterManager";
import { EditorOpenHandler } from "./editorOpenHandler";
import { getStats } from "./fsHandy";
import { ReadonlyDocumentProvider } from "./readonlyDocumentProvider";

export class TemporaryFileOpenManager implements EditorOpenHandler {
  public get onDidLayoutReact(): Event<void> {
    return this.didLayoutReact.event;
  }
  public async handleDidOpenURI(uRI: Uri): Promise<boolean> {
    if (this.diffLayouterManager.layoutSwitchInProgress) {
      return false;
    }
    const diffedURIs = this.getDiffedURIs(uRI);
    if (diffedURIs === undefined || !(await this.filesExist(diffedURIs))) {
      return false;
    }
    if (this.diffLayouterManager.layoutSwitchInProgress) {
      return false;
    }
    this.didLayoutReact.fire();
    return await this.diffLayouterManager.openDiffedURIs(diffedURIs, true);
  }

  public getDiffedURIs(baseURI: Uri): DiffedURIs | undefined {
    const parseResult = parseBaseFileNameRE.exec(baseURI.path);
    if (parseResult === null) {
      return undefined;
    }
    const baseFileName = parseResult[1];
    const restWOGit = parseResult[3];
    const extension = parseResult[4];
    function joinBasePath(scheme: string, appendedParts: string[]) {
      return Uri.joinPath(
        baseURI,
        ["../", baseFileName, ...appendedParts].join("")
      ).with({ scheme });
    }
    const readonlyScheme = this.readonlyDocumentProvider.scheme;
    return new DiffedURIs(
      joinBasePath(readonlyScheme, ["_BASE_", restWOGit]),
      joinBasePath(readonlyScheme, ["_LOCAL_", restWOGit]),
      joinBasePath(readonlyScheme, ["_REMOTE_", restWOGit]),
      joinBasePath("file", [extension]),
      joinBasePath(readonlyScheme, ["_BACKUP_", restWOGit])
    );
  }

  public async filesExist(diffedURIs: DiffedURIs): Promise<boolean> {
    return (
      await Promise.all(
        toURIList(diffedURIs).map(async (uRI) => {
          if (uRI.fsPath.endsWith(".git")) {
            console.warn(
              'Path ends with ".git" ' +
                "which might be wrong and causing problems."
            );
          }
          const stats = await getStats(uRI.fsPath);
          return stats?.isFile() === true;
        })
      )
    ).every((exists) => exists);
  }

  public ignorePathOverride(fsPath: string): boolean {
    return (
      this.diffLayouterManager.diffedURIs !== undefined &&
      fsPathOccursIn(this.diffLayouterManager.diffedURIs, fsPath)
    );
  }

  public constructor(
    private readonly diffLayouterManager: DiffLayouterManager,
    private readonly readonlyDocumentProvider: ReadonlyDocumentProvider
  ) {}
  private readonly didLayoutReact = new EventEmitter<void>();
}
