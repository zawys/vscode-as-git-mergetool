import { DiffedURIs, asURIList } from "./diffedURIs";
import * as vscode from 'vscode';
import { Monitor } from "./monitor";
import { TemporarySideBySideSettingsManager } from "./temporarySettingsManager";

export interface DiffLayouter {
  /**
   * Try start layout.
   *
   * @returns if layout could be activated.
   */
  tryActivate(): Promise<boolean>;

  /**
   * Save the merge result.
   */
  save(): Promise<void>;

  /**
   * Switch back to previous layout.
   */
  deactivate(): Promise<void>;

  /**
   * Focus merge conflict.
   *
   * @returns Promise, if merge conflict indicators exist, undefined on error.
   */
  focusMergeConflict(type: SearchType): boolean | undefined;

   /**
   * If layout is currently applied.
   */
  readonly isEmployed: boolean;

  /**
   * Passed to `tryStartMerge`. Used to find out if layout switch needed.
   * Should change at the beginning of layout start and
   */
  readonly diffedURIs: DiffedURIs;

  /**
   * Fired when the layout was deactivated.
   */
  readonly onDidDeactivate: vscode.Event<void>;
}

export interface DiffLayouterFactory {
  readonly settingValue: string;

  create(
    monitor: Monitor,
    temporarySideBySideSettingsManager: TemporarySideBySideSettingsManager,
    diffedURIs: DiffedURIs,
  ): DiffLayouter;
}

export function watchDiffedURIs(
  uRIs: DiffedURIs,
  handler: () => void,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  for (const uRI of asURIList(uRIs)) {
    if (uRI.fsPath.endsWith(".git")) {
      vscode.window.showErrorMessage("path ends with .git");
    }
    const watcher = vscode.workspace.createFileSystemWatcher(
      uRI.fsPath, true, true, false
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

export const focusPreviousConflictCommandID =
  "vscode-as-git-mergetool.focusPreviousConflict";
export const focusNextConflictCommandID =
  "vscode-as-git-mergetool.focusNextConflict";
