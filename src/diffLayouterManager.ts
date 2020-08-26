import * as vscode from 'vscode';
import { getDiffedURIs, occursIn, parseBaseFileNameRE, DiffedURIs, filesExist } from './diffedURIs';
import { DiffLayouter, DiffLayouterFactory, SearchType, focusPreviousConflictCommandID, focusNextConflictCommandID } from './diffLayouter';
import { defaultTemporarySideBySideSettingsManager } from './temporarySettingsManager';
import { FourTransferDownLayouterFactory } from './fourTransferDownLayouter';
import { FourTransferRightLayouterFactory } from './fourTransferRightLayouter';
import { Monitor } from './monitor';
import { ThreeDiffToBaseLayouterFactory } from './threeDiffToBaseLayouter';
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
    return this.layouter?.isEmployed === true ?
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

  public get onDidLayoutDeactivate(): vscode.Event<void> {
    return this.didLayoutDeactivate.event;
  }

  public get onDidLayoutActivate(): vscode.Event<void> {
    return this.didLayoutActivate.event;
  }

  public get diffedURIs(): DiffedURIs | undefined {
    return this.layouter?.isEmployed ? this.layouter.diffedURIs : undefined;
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
      defaultTemporarySideBySideSettingsManager,
  ) {
    if (factories.length === 0) { throw new Error(); }
    this.defaultFactory = factories[0];
  }

  private layouter: DiffLayouter | undefined;
  private readonly layouterMonitor = new Monitor();
  private readonly layouterManagerMonitor = new Monitor();
  private disposables: vscode.Disposable[] = [];
  private readonly defaultFactory: DiffLayouterFactory;
  private readonly didLayoutDeactivate = new vscode.EventEmitter<void>();
  private readonly didLayoutActivate = new vscode.EventEmitter<void>();

  /**
   *
   * @param doc opened TextDocument
   * @returns whether a layouter is active afterwards
   */
  private async handleDidOpenTextDocument(
    doc: vscode.TextDocument
  ): Promise<boolean> {
    const diffedURIs = getDiffedURIs(doc.uri);
    if (diffedURIs === undefined || !(await filesExist(diffedURIs))) {
      return false;
    }
    await this.layouterManagerMonitor.enter();
    try {
      const activeDiffedURIs = this.layouter?.diffedURIs;
      if (
        this.layouter?.isEmployed === true &&
        activeDiffedURIs !== undefined &&
        occursIn(activeDiffedURIs, doc.uri)
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
        this.layouterMonitor, this.temporarySideBySideSettingsManager, diffedURIs,
      );
      this.layouter.onDidDeactivate(() => this.didLayoutDeactivate.fire());
      await this.layouter.tryActivate();
    } finally {
      await this.layouterManagerMonitor.leave();
    }
    this.didLayoutActivate.fire();
    return true;
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
}

const layoutSettingID = "vscode-as-git-mergetool.layout";
const deactivateLayoutCommandID = "vscode-as-git-mergetool.deactivateLayout";
