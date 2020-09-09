// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as vscode from "vscode";
import { asURIList, DiffedURIs } from "../diffedURIs";
import { extensionID } from "../iDs";
import { Monitor } from "../monitor";
import { TemporarySettingsManager } from "../temporarySettingsManager";
import { VSCodeConfigurator } from "../vSCodeConfigurator";
import { Zoom, ZoomManager } from "../zoom";

export interface DiffLayouter extends vscode.Disposable {
  /**
   * Try start layout.
   *
   * @returns if layout could be activated.
   */
  tryActivate(zoom: Zoom, onlyGrid?: boolean): Promise<boolean>;

  /**
   * Reset the layout.
   */
  setLayout(zoom: Zoom): Promise<void>;

  /**
   * Save the merge result.
   */
  save(): Promise<void>;

  /**
   * Switch back to previous layout.
   */
  deactivate(onlyGrid?: boolean): Promise<void>;

  /**
   * Focus merge conflict.
   *
   * @returns Promise, if merge conflict indicators exist, undefined on error.
   */
  focusMergeConflict(type: SearchType): boolean | undefined;

  /**
   * If layout is currently applied.
   */
  readonly isActive: boolean;

  /**
   * If layout going to be activated.
   */
  readonly isActivating: boolean;

  /**
   * Passed to `tryStartMerge`. Used to find out if layout switch needed.
   * Should change at the beginning of layout start and
   */
  readonly diffedURIs: DiffedURIs;

  /**
   * Fired when the layout was deactivated.
   */
  readonly onDidDeactivate: vscode.Event<DiffLayouter>;

  readonly wasInitiatedByMergetool: boolean;

  setWasInitiatedByMergetool(): void;
}

export interface DiffLayouterFactoryParameters {
  readonly monitor: Monitor;
  readonly diffedURIs: DiffedURIs;
  readonly temporarySettingsManager: TemporarySettingsManager;
  readonly vSCodeConfigurator: VSCodeConfigurator;
  readonly zoomManager: ZoomManager;
}

export interface DiffLayouterFactory {
  readonly settingValue: string;

  create(parameters: DiffLayouterFactoryParameters): DiffLayouter;
}

export function watchDiffedURIs(
  uRIs: DiffedURIs,
  handler: () => void
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  for (const uRI of asURIList(uRIs)) {
    if (uRI.fsPath.endsWith(".git")) {
      void vscode.window.showErrorMessage("path ends with .git");
    }
    const watcher = vscode.workspace.createFileSystemWatcher(
      uRI.fsPath,
      true,
      true,
      false
    );
    disposables.push(watcher);
    watcher.onDidDelete(handler, disposables);
  }
  return disposables;
}

export enum SearchType {
  first,
  next,
  previous,
}

export const focusPreviousConflictCommandID = `${extensionID}.focusPreviousConflict`;
export const focusNextConflictCommandID = `${extensionID}.focusNextConflict`;
