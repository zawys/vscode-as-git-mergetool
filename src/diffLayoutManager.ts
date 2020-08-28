import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DiffedURIs, filesExist, getDiffedURIs } from './diffedURIs';
import { DiffFileSelector } from './diffFileSelector';
import { getGitPathInteractively } from './getPaths';
import { extensionID } from './iDs';
import { DiffLayouter, DiffLayouterFactory, focusNextConflictCommandID, focusPreviousConflictCommandID, SearchType } from './layouters/diffLayouter';
import { FourTransferDownLayouterFactory } from './layouters/fourTransferDownLayouter';
import { FourTransferRightLayouterFactory } from './layouters/fourTransferRightLayouter';
import { ThreeDiffToBaseLayouterFactory } from './layouters/threeDiffToBaseLayouter';
import { containsMergeConflictIndicators } from './mergeConflictDetector';
import { Monitor } from './monitor';
import { defaultTemporarySideBySideSettingsManagerLazy } from './temporarySettingsManager';
import { defaultVSCodeConfigurator } from './vSCodeConfigurator';

export class DiffLayoutManager {
  public async register(): Promise<void> {
    for (const disposabe of this.disposables) { disposabe.dispose(); }
    this.disposables = [
      vscode.workspace.onDidOpenTextDocument(
        this.handleDidOpenTextDocument.bind(this),
      ),
      vscode.commands.registerCommand(focusPreviousConflictCommandID,
        this.focusMergeConflictInteractively.bind(this, SearchType.previous),
      ),
      vscode.commands.registerCommand(focusNextConflictCommandID,
        this.focusMergeConflictInteractively.bind(this, SearchType.next)
      ),
      vscode.commands.registerCommand(deactivateLayoutCommandID,
        this.deactivateLayout.bind(this),
      ),
      vscode.commands.registerCommand(resetMergedFileCommandID,
        this.resetMergedFile.bind(this),
      ),
      vscode.commands.registerCommand(mergeArbitraryFilesCommandID,
        this.mergeArbitraryFiles.bind(this),
      ),
    ];
    for (const editor of vscode.window.visibleTextEditors) {
      if (await this.handleDidOpenTextDocument(editor.document)) { break; }
    }
  }

  public async deactivateLayout() {
    await this.layouterManagerMonitor.enter();
    try {
      await this.layouter?.deactivate();
      this.layouter = undefined;
    } finally {
      await this.layouterManagerMonitor.leave();
    }
  }

  public async save() {
    await this.layouter?.save();
  }

  public focusMergeConflict(type: SearchType): undefined | boolean {
    return this.layouter?.isActive === true ?
      this.layouter.focusMergeConflict(type) :
      undefined;
  }

  public focusMergeConflictInteractively(
    type: SearchType
  ): undefined | boolean {
    const result = this.focusMergeConflict(type);
    if (result === undefined) {
      vscode.window.showErrorMessage("No diff layout active.");
    } else if (result === false) {
      vscode.window.showInformationMessage("No merge conflict found.");
    }
    return result;
  }

  public get onDidLayoutDeactivate(): vscode.Event<DiffLayouter> {
    return this.didLayoutDeactivate.event;
  }

  public get onDidLayoutActivate(): vscode.Event<DiffLayouter> {
    return this.didLayoutActivate.event;
  }

  public get diffedURIs(): DiffedURIs | undefined {
    return (this.layouter?.isActivating
      || this.layouter?.isActive
    ) ? this.layouter.diffedURIs : undefined;
  }

  public async dispose(): Promise<void> {
    for (const disposable of this.disposables) { disposable.dispose(); }
    this.disposables = [];
    await this.deactivateLayout();
  }

  public constructor(
    private readonly factories: DiffLayouterFactory[] = [
      new FourTransferRightLayouterFactory(),
      new ThreeDiffToBaseLayouterFactory(),
      new FourTransferDownLayouterFactory(),
    ],
    private readonly vSCodeConfigurator = defaultVSCodeConfigurator,
    private readonly temporarySideBySideSettingsManager =
      defaultTemporarySideBySideSettingsManagerLazy,
  ) {
    if (factories.length === 0) { throw new Error(); }
    this.defaultFactory = factories[0];
  }

  public async resetMergedFile() {
    await new Promise((resolve, reject) => {
      const diffedURIs = this.diffedURIs;
      if (this.layouter?.isActive === undefined
        || diffedURIs === undefined
      ) {
        vscode.window.showErrorMessage(
          "Reset not applicable; no merge situation opened."
        );
        return;
      }
      if (diffedURIs?.backup === undefined) {
        vscode.window.showErrorMessage("Backup file is unknown.");
        return;
      }
      fs.copyFile(
        diffedURIs.backup.fsPath,
        diffedURIs.merged.fsPath,
        err => (err ? reject(err) : resolve()),
      );
    });
  }

  private layouter: DiffLayouter | undefined;
  private readonly layouterMonitor = new Monitor();
  private readonly layouterManagerMonitor = new Monitor();
  private disposables: vscode.Disposable[] = [];
  private readonly defaultFactory: DiffLayouterFactory;
  private readonly didLayoutDeactivate =
    new vscode.EventEmitter<DiffLayouter>();
  private readonly didLayoutActivate =
    new vscode.EventEmitter<DiffLayouter>();
  private diffFileSelector: DiffFileSelector | undefined;

  /**
   *
   * @param doc opened TextDocument
   * @returns whether a layouter is active afterwards
   */
  private handleDidOpenTextDocument(
    doc: vscode.TextDocument
  ): Promise<boolean> {
    return this.handleDidOpenURI(doc.uri);
  }

  private async handleDidOpenURI(uRI: vscode.Uri): Promise<boolean> {
    const diffedURIs = getDiffedURIs(uRI);
    if (diffedURIs === undefined || !(await filesExist(diffedURIs))) {
      return false;
    }
    return await this.openDiffedURIs(diffedURIs);
  }

  private async openDiffedURIs(diffedURIs: DiffedURIs): Promise<boolean> {
    await this.layouterManagerMonitor.enter();
    try {
      const activeDiffedURIs = this.layouter?.diffedURIs;
      if (
        (this.layouter?.isActivating || this.layouter?.isActive) === true
        && activeDiffedURIs !== undefined
        && diffedURIs.equalsWithoutBackup(activeDiffedURIs)
      ) { return true; }

      const oldLayouter = this.layouter;
      const newLayouterFactory = await this.getLayoutFactory();
      if (newLayouterFactory === undefined) { return false; }

      // point of no return

      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
      await oldLayouter?.deactivate();

      this.layouter = newLayouterFactory.create(
        this.layouterMonitor,
        this.temporarySideBySideSettingsManager.value,
        diffedURIs,
      );
      this.layouter.onDidDeactivate(
        this.handleLayouterDidDeactivate.bind(this)
      );
      await this.layouter.tryActivate();
    } finally {
      await this.layouterManagerMonitor.leave();
    }
    this.didLayoutActivate.fire(this.layouter);
    return true;
  }

  private async handleLayouterDidDeactivate(layouter: DiffLayouter) {
    this.didLayoutDeactivate.fire(layouter);
    if (!layouter.wasInitiatedByMergetool) {
      const text = await new Promise<string | undefined>((resolve, reject) =>
        fs.readFile(layouter.diffedURIs.merged.fsPath, 'utf8', (err, data) => {
          if (err) { reject(err); } else { resolve(data); }
        })
      );
      if (text !== undefined && containsMergeConflictIndicators(text)) {
        const reopen = "Reopen";
        const keepClosed = "Keep closed";
        const result = await vscode.window.showWarningMessage(
          "Merge conflict markers are included in closed file.",
          reopen, keepClosed,
        );
        if (result === reopen) {
          if (!await this.openDiffedURIs(layouter.diffedURIs)) {
            vscode.window.showErrorMessage(
              "Opening failed, probably because one of the files was removed."
            );
          }
        }
      }
    }
  }

  private async getLayoutFactory(): Promise<DiffLayouterFactory | undefined> {
    let layoutSetting = this.vSCodeConfigurator.get(layoutSettingID);
    while (true) {
      for (const factory of this.factories) {
        if (factory.settingValue === layoutSetting) {
          return factory;
        }
      }
      const restoreItem: vscode.MessageItem = { title: "Restore default" };
      const onceItem: vscode.MessageItem = { title: "Use default once" };
      const cancelItem: vscode.MessageItem = { title: "Cancel" };
      const selectedItem = await vscode.window.showErrorMessage(
        "Diff layout setting has an unknown value.",
        restoreItem, onceItem, cancelItem,
      );
      if (selectedItem === cancelItem || selectedItem === undefined) {
        return;
      }
      if (selectedItem === restoreItem) {
        await this.vSCodeConfigurator.set(
          layoutSettingID, this.defaultFactory.settingValue
        );
      }
      layoutSetting = this.defaultFactory.settingValue;
    }
  }

  private async mergeArbitraryFiles(): Promise<boolean> {
    if (this.diffFileSelector === undefined) {
      this.diffFileSelector = new DiffFileSelector();
    }
    const diffedURIs = await this.diffFileSelector.doSelection();
    if (diffedURIs === undefined) { return false; }
    const gitPath = await getGitPathInteractively();
    if (gitPath === undefined) { return false; }
    const mergedPath = diffedURIs.merged.fsPath;
    const gitResult = await new Promise<{
      err: cp.ExecException | null,
      stdout: string,
      stderr: string,
    }>(resolve =>
      cp.execFile(
        gitPath,
        [
          "merge-file",
          "--stdout",
          diffedURIs.local.fsPath,
          diffedURIs.base.fsPath,
          diffedURIs.remote.fsPath,
        ],
        {
          cwd: path.dirname(mergedPath),
          timeout: 10000,
          windowsHide: true,
        },
        (err, stdout, stderr) => resolve({ err, stdout, stderr })
      )
    );
    const error = gitResult.err;
    if (error !== null && (
      error.code === undefined
      || (error.code < 0 || error.code > 127)
    )) {
      vscode.window.showErrorMessage(
        `Error when merging files by Git: ${gitResult.stderr}.`
      );
      return false;
    }
    if (!await new Promise(resolve => fs.writeFile(
      mergedPath, gitResult.stdout, err => resolve(err === null),
    ))) { return false; }
    return await this.openDiffedURIs(diffedURIs);
  }
}

const layoutSettingID = `${extensionID}.layout`;
const deactivateLayoutCommandID = `${extensionID}.deactivateLayout`;
const resetMergedFileCommandID = `${extensionID}.resetMergedFile`;
const mergeArbitraryFilesCommandID = `${extensionID}.mergeArbitraryFiles`;
