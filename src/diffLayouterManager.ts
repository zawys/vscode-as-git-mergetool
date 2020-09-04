import * as fs from "fs";
import * as vscode from "vscode";
import { DiffedURIs, filesExist, getDiffedURIs } from "./diffedURIs";
import { copy } from "./fsHandy";
import { extensionID } from "./iDs";
import {
  DiffLayouter,
  DiffLayouterFactory,
  focusNextConflictCommandID,
  focusPreviousConflictCommandID,
  SearchType,
} from "./layouters/diffLayouter";
import { FourTransferDownLayouterFactory } from "./layouters/fourTransferDownLayouter";
import { FourTransferRightLayouterFactory } from "./layouters/fourTransferRightLayouter";
import { ThreeDiffToBaseLayouterFactory } from "./layouters/threeDiffToBaseLayouter";
import { ThreeDiffToBaseMergedRightLayouterFactory } from "./layouters/threeDiffToBaseMergedRightLayouter";
import { ThreeDiffToBaseRowsLayouterFactory } from "./layouters/threeDiffToBaseRowsLayouter";
import { containsMergeConflictIndicators } from "./mergeConflictDetector";
import { Monitor } from "./monitor";
import { TemporarySettingsManager } from "./temporarySettingsManager";
import { VSCodeConfigurator } from "./vSCodeConfigurator";

export class DiffLayouterManager implements vscode.Disposable {
  public async register(): Promise<void> {
    for (const disposabe of this.disposables) {
      disposabe.dispose();
    }
    this.disposables = [
      vscode.workspace.onDidOpenTextDocument(
        this.handleDidOpenTextDocument.bind(this)
      ),
      vscode.commands.registerCommand(
        focusPreviousConflictCommandID,
        this.focusMergeConflictInteractively.bind(this, SearchType.previous)
      ),
      vscode.commands.registerCommand(
        focusNextConflictCommandID,
        this.focusMergeConflictInteractively.bind(this, SearchType.next)
      ),
      vscode.commands.registerCommand(
        deactivateLayoutCommandID,
        this.deactivateLayout.bind(this)
      ),
      vscode.commands.registerCommand(
        resetMergedFileCommandID,
        this.resetMergedFile.bind(this)
      ),
    ];
    for (const editor of vscode.window.visibleTextEditors) {
      if (await this.handleDidOpenTextDocument(editor.document)) {
        return;
      }
    }
    await this.temporarySettingsManager.resetSettings();
  }

  public async deactivateLayout(): Promise<void> {
    await this.layouterManagerMonitor.enter();
    try {
      await this.layouter?.deactivate();
      this.layouter = undefined;
    } finally {
      await this.layouterManagerMonitor.leave();
    }
  }

  public async save(): Promise<void> {
    await this.layouter?.save();
  }

  public focusMergeConflict(type: SearchType): undefined | boolean {
    return this.layouter?.isActive === true
      ? this.layouter.focusMergeConflict(type)
      : undefined;
  }

  public focusMergeConflictInteractively(
    type: SearchType
  ): undefined | boolean {
    const result = this.focusMergeConflict(type);
    if (result === undefined) {
      void vscode.window.showErrorMessage("No diff layout active.");
    } else if (result === false) {
      void vscode.window.showInformationMessage("No merge conflict found.");
    }
    return result;
  }

  public get onDidLayoutDeactivate(): vscode.Event<DiffLayouter> {
    return this.didLayoutDeactivate.event;
  }

  public get onDidLayoutActivate(): vscode.Event<DiffLayouter> {
    return this.didLayoutActivate.event;
  }
  public get onDidLayoutReact(): vscode.Event<void> {
    return this.didMergetoolReact.event;
  }

  public get diffedURIs(): DiffedURIs | undefined {
    return this.layouter?.isActivating || this.layouter?.isActive
      ? this.layouter.diffedURIs
      : undefined;
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.layouter?.dispose();
  }

  public constructor(
    public readonly vSCodeConfigurator: VSCodeConfigurator,
    public readonly temporarySettingsManager: TemporarySettingsManager,
    public readonly factories: DiffLayouterFactory[] = [
      new FourTransferRightLayouterFactory(),
      new ThreeDiffToBaseLayouterFactory(),
      new FourTransferDownLayouterFactory(),
      new ThreeDiffToBaseRowsLayouterFactory(),
      new ThreeDiffToBaseMergedRightLayouterFactory(),
    ]
  ) {
    if (factories.length === 0) {
      throw new Error("internal error: no factory registered");
    }
    this.defaultFactory = factories[0];
  }

  public async resetMergedFile(): Promise<void> {
    const diffedURIs = this.diffedURIs;
    if (this.layouter?.isActive === undefined || diffedURIs === undefined) {
      void vscode.window.showErrorMessage(
        "Reset not applicable; no merge situation opened."
      );
      return;
    }
    if (diffedURIs?.backup === undefined) {
      void vscode.window.showErrorMessage("Backup file is unknown.");
      return;
    }
    if (!(await copy(diffedURIs.backup.fsPath, diffedURIs.merged.fsPath))) {
      void vscode.window.showErrorMessage("Resetting the merged file failed");
      return;
    }
  }

  public async openDiffedURIs(diffedURIs: DiffedURIs): Promise<boolean> {
    await this.layouterManagerMonitor.enter();
    try {
      const activeDiffedURIs = this.layouter?.diffedURIs;
      if (
        (this.layouter?.isActivating || this.layouter?.isActive) === true &&
        activeDiffedURIs !== undefined &&
        diffedURIs.equalsWithoutBackup(activeDiffedURIs)
      ) {
        return true;
      }

      const oldLayouter = this.layouter;
      const newLayouterFactory = await this.getLayoutFactory();
      if (newLayouterFactory === undefined) {
        return false;
      }

      // point of no return

      await vscode.commands.executeCommand(
        "workbench.action.closeActiveEditor"
      );
      await oldLayouter?.deactivate();

      this.layouter = newLayouterFactory.create(
        this.layouterMonitor,
        this.temporarySettingsManager,
        diffedURIs,
        this.vSCodeConfigurator
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

  private layouter: DiffLayouter | undefined;
  private readonly layouterMonitor = new Monitor();
  private readonly layouterManagerMonitor = new Monitor();
  private disposables: vscode.Disposable[] = [];
  private readonly defaultFactory: DiffLayouterFactory;
  private readonly didLayoutDeactivate = new vscode.EventEmitter<
    DiffLayouter
  >();
  private readonly didLayoutActivate = new vscode.EventEmitter<DiffLayouter>();
  private readonly didMergetoolReact = new vscode.EventEmitter<void>();

  /**
   *
   * @param document opened TextDocument
   * @returns whether a layouter is active afterwards
   */
  private handleDidOpenTextDocument(
    document: vscode.TextDocument
  ): Promise<boolean> {
    return this.handleDidOpenURI(document.uri);
  }

  private async handleDidOpenURI(uRI: vscode.Uri): Promise<boolean> {
    const diffedURIs = getDiffedURIs(uRI);
    if (diffedURIs === undefined || !(await filesExist(diffedURIs))) {
      return false;
    }
    this.didMergetoolReact.fire();
    return await this.openDiffedURIs(diffedURIs);
  }

  private async handleLayouterDidDeactivate(layouter: DiffLayouter) {
    this.didLayoutDeactivate.fire(layouter);
    if (!layouter.wasInitiatedByMergetool) {
      const text = await new Promise<string | undefined>((resolve) =>
        fs.readFile(layouter.diffedURIs.merged.fsPath, "utf8", (error, data) =>
          resolve(error ? undefined : data)
        )
      );
      if (text !== undefined && containsMergeConflictIndicators(text)) {
        const reopen = "Reopen";
        const keepClosed = "Keep closed";
        const result = await vscode.window.showWarningMessage(
          "Merge conflict markers are included in closed file.",
          reopen,
          keepClosed
        );
        if (result === reopen) {
          if (!(await this.openDiffedURIs(layouter.diffedURIs))) {
            void vscode.window.showErrorMessage(
              "Opening failed, probably because one of the files was removed."
            );
          }
        }
      }
    }
  }

  private async getLayoutFactory(): Promise<DiffLayouterFactory | undefined> {
    let layoutSetting = this.vSCodeConfigurator.get(layoutSettingID);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (const factory of this.factories) {
        if (factory.settingValue === layoutSetting) {
          return factory;
        }
      }
      const restoreItem: vscode.MessageItem = {
        title: "Restore default",
      };
      const onceItem: vscode.MessageItem = {
        title: "Use default once",
      };
      const cancelItem: vscode.MessageItem = { title: "Cancel" };
      const selectedItem = await vscode.window.showErrorMessage(
        "Diff layout setting has an unknown value.",
        restoreItem,
        onceItem,
        cancelItem
      );
      if (selectedItem === cancelItem || selectedItem === undefined) {
        return;
      }
      if (selectedItem === restoreItem) {
        await this.vSCodeConfigurator.set(
          layoutSettingID,
          this.defaultFactory.settingValue
        );
      }
      layoutSetting = this.defaultFactory.settingValue;
    }
  }
}

export const layoutSettingID = `${extensionID}.layout`;
export const deactivateLayoutCommandID = `${extensionID}.deactivateLayout`;
export const resetMergedFileCommandID = `${extensionID}.resetMergedFile`;
