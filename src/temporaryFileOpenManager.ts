// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { Event, EventEmitter, Uri, window } from "vscode";
import {
  toURIList,
  DiffedURIs,
  parseBaseFileNameRE,
  toPathList,
} from "./diffedURIs";
import { DiffLayouterManager } from "./diffLayouterManager";
import { EditorOpenHandler } from "./editorOpenHandler";
import { getStats } from "./fsHandy";
import { ReadonlyDocumentProvider } from "./readonlyDocumentProvider";

export class TemporaryFileOpenManager implements EditorOpenHandler {
  public get onDidLayoutReact(): Event<void> {
    return this.didMergetoolReact.event;
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
    this.didMergetoolReact.fire();
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
    function joinBasePath(parts: string[], scheme: string) {
      return Uri.joinPath(baseURI, parts.join("")).with({
        scheme,
      });
    }
    const readonlyScheme = this.readonlyDocumentProvider.scheme;
    return new DiffedURIs(
      joinBasePath(["../", baseFileName, "_BASE_", restWOGit], readonlyScheme),
      joinBasePath(
        ["../", baseFileName, "_LOCAL_", restWOGit],
        readonlyScheme
      ),
      joinBasePath(
        ["../", baseFileName, "_REMOTE_", restWOGit],
        readonlyScheme
      ),
      joinBasePath(["../", baseFileName, extension], "file"),
      joinBasePath(
        ["../", baseFileName, "_BACKUP_", restWOGit],
        readonlyScheme
      )
    );
  }

  public async filesExist(diffedURIs: DiffedURIs): Promise<boolean> {
    return (
      await Promise.all(
        toURIList(diffedURIs).map(async (uRI) => {
          if (uRI.fsPath.endsWith(".git")) {
            void window.showErrorMessage("path ends with .git");
          }
          const stats = await getStats(uRI.fsPath);
          if (stats === undefined) {
            return false;
          }
          return stats.isFile();
        })
      )
    ).every((exists) => exists);
  }

  public get pathsToIgnore(): string[] {
    return this.diffLayouterManager.diffedURIs === undefined
      ? []
      : toPathList(this.diffLayouterManager.diffedURIs);
  }

  public constructor(
    private readonly diffLayouterManager: DiffLayouterManager,
    private readonly readonlyDocumentProvider: ReadonlyDocumentProvider
  ) {}
  private readonly didMergetoolReact = new EventEmitter<void>();
}
