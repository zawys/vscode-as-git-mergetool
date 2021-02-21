import { readFile } from "fs";
import {
  Disposable,
  window,
  commands,
  Event,
  EventEmitter,
  StatusBarItem,
  StatusBarAlignment,
  TextEditor,
  Uri,
  MessageItem,
} from "vscode";
import { DiffedURIs, filesExist, getDiffedURIs } from "./diffedURIs";
import { copy } from "./fsHandy";
import { GitMergetoolReplacement } from "./gitMergetoolReplacement";
import { extensionID } from "./ids";
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
import { ThreeDiffToMergedLayouterFactory } from "./layouters/threeDiffToMergedLayouter";
import { containsMergeConflictIndicators } from "./mergeConflictDetector";
import { Monitor } from "./monitor";
import { TemporarySettingsManager } from "./temporarySettingsManager";
import { VSCodeConfigurator } from "./vSCodeConfigurator";
import { Zoom, ZoomManager } from "./zoom";

export class DiffLayouterManager implements Disposable {
  public async register(): Promise<void> {
    for (const disposabe of this.disposables) {
      disposabe.dispose();
    }
    this.disposables = [
      window.onDidChangeVisibleTextEditors(
        this.handleDidChangeVisibleTextEditors.bind(this)
      ),
      commands.registerCommand(
        focusPreviousConflictCommandID,
        this.focusMergeConflictInteractively.bind(this, SearchType.previous)
      ),
      commands.registerCommand(
        focusNextConflictCommandID,
        this.focusMergeConflictInteractively.bind(this, SearchType.next)
      ),
      commands.registerCommand(
        deactivateLayoutCommandID,
        this.deactivateLayout.bind(this)
      ),
      commands.registerCommand(
        resetMergedFileCommandID,
        this.resetMergedFile.bind(this)
      ),
      commands.registerCommand(
        switchLayoutCommandID,
        this.switchLayout.bind(this)
      ),
      this.zoomManager.onWasZoomRequested(
        this.handleWasZoomRequested.bind(this)
      ),
    ];
    for (const editor of window.visibleTextEditors) {
      if (await this.handleDidOpenURI(editor.document.uri)) {
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
      this.layouterFactory = undefined;
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
      void window.showErrorMessage("No diff layout active.");
    } else if (result === false) {
      void window.showInformationMessage("No merge conflict found.");
    }
    return result;
  }

  public get onDidLayoutDeactivate(): Event<DiffLayouter> {
    return this.didLayoutDeactivate.event;
  }

  public get onDidLayoutActivate(): Event<DiffLayouter> {
    return this.didLayoutActivate.event;
  }
  public get onDidLayoutReact(): Event<void> {
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

  public async resetMergedFile(): Promise<void> {
    const diffedURIs = this.diffedURIs;
    if (this.layouter?.isActive === undefined || diffedURIs === undefined) {
      void window.showErrorMessage(
        "Reset not applicable; no merge situation opened."
      );
      return;
    }
    if (diffedURIs?.backup === undefined) {
      void window.showErrorMessage("Backup file is unknown.");
      return;
    }
    if (!(await copy(diffedURIs.backup.fsPath, diffedURIs.merged.fsPath))) {
      void window.showErrorMessage("Resetting the merged file failed");
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

      const newLayouterFactory = await this.getLayoutFactory();
      if (newLayouterFactory === undefined) {
        return false;
      }

      // point of no return

      await commands.executeCommand("workbench.action.closeActiveEditor");
      await this.activateLayouter(diffedURIs, newLayouterFactory);
    } finally {
      await this.layouterManagerMonitor.leave();
    }
    if (this.layouter !== undefined) {
      this.didLayoutActivate.fire(this.layouter);
    }
    return true;
  }

  public async switchLayout(layoutName?: unknown): Promise<void> {
    if (this.layouter?.diffedURIs === undefined) {
      void window.showErrorMessage(
        "This requires the diff layout to be active"
      );
      return;
    }
    let targetFactory: DiffLayouterFactory | undefined;
    if (typeof layoutName === "string") {
      targetFactory = this.factories.find(
        (factory) => factory.settingValue === layoutName
      );
    }
    if (targetFactory === undefined) {
      const pickResult = await window.showQuickPick(
        this.factories
          .filter((factory) => factory !== this.layouterFactory)
          .map((factory) => factory.settingValue)
      );
      if (pickResult === undefined) {
        return;
      }
      targetFactory = this.factories.find(
        (factory) => factory.settingValue === pickResult
      );
      if (targetFactory === undefined) {
        return;
      }
    }
    if (
      targetFactory === this.layouterFactory ||
      this.layouter?.diffedURIs === undefined
    ) {
      void window.showErrorMessage(
        "The situation has changed meanwhile. Please try again."
      );
    }
    await this.layouterManagerMonitor.enter();
    try {
      await this.activateLayouter(this.layouter.diffedURIs, targetFactory);
    } finally {
      await this.layouterManagerMonitor.leave();
    }
    if (this.layouter !== undefined) {
      this.didLayoutActivate.fire(this.layouter);
    }
  }

  public constructor(
    public readonly vSCodeConfigurator: VSCodeConfigurator,
    public readonly zoomManager: ZoomManager,
    public readonly temporarySettingsManager: TemporarySettingsManager,
    public readonly gitMergetoolReplacement: GitMergetoolReplacement,
    public readonly factories: DiffLayouterFactory[] = [
      new ThreeDiffToMergedLayouterFactory(),
      new ThreeDiffToBaseLayouterFactory(),
      new ThreeDiffToBaseRowsLayouterFactory(),
      new ThreeDiffToBaseMergedRightLayouterFactory(),
      new FourTransferRightLayouterFactory(),
      new FourTransferDownLayouterFactory(),
    ]
  ) {
    if (factories.length === 0) {
      throw new Error("internal error: no factory registered");
    }
    const defaultFactory = factories.find(
      (factory) =>
        factory.settingValue ===
        new FourTransferRightLayouterFactory().settingValue
    );
    if (defaultFactory === undefined) {
      throw new Error("could not find default factory");
    }
    this.defaultFactory = defaultFactory;
  }

  private layouterFactory: DiffLayouterFactory | undefined;
  private layouter: DiffLayouter | undefined;
  private readonly layouterMonitor = new Monitor();
  private readonly layouterManagerMonitor = new Monitor();
  private disposables: Disposable[] = [];
  private readonly defaultFactory: DiffLayouterFactory;
  private readonly didLayoutDeactivate = new EventEmitter<DiffLayouter>();
  private readonly didLayoutActivate = new EventEmitter<DiffLayouter>();
  private readonly didMergetoolReact = new EventEmitter<void>();
  private switchLayoutStatusBarItem: StatusBarItem | undefined;

  private activateSwitchLayoutStatusBarItem(): void {
    if (this.switchLayoutStatusBarItem !== undefined) {
      return;
    }
    this.switchLayoutStatusBarItem = window.createStatusBarItem(
      StatusBarAlignment.Left,
      5
    );
    this.switchLayoutStatusBarItem.text = "$(editor-layout)";
    this.switchLayoutStatusBarItem.command = switchLayoutCommandID;
    this.switchLayoutStatusBarItem.tooltip = "Switch diff editor layout…";
    this.switchLayoutStatusBarItem.show();
  }

  private deactivateSwitchLayoutStatusBarItem(): void {
    this.switchLayoutStatusBarItem?.dispose();
    this.switchLayoutStatusBarItem = undefined;
  }

  private async activateLayouter(
    diffedURIs: DiffedURIs,
    newLayouterFactory: DiffLayouterFactory
  ): Promise<void> {
    const oldLayouter = this.layouter;
    if (oldLayouter !== undefined) {
      await oldLayouter.deactivate(true);
    }

    this.layouterFactory = newLayouterFactory;
    this.layouter = newLayouterFactory.create({
      monitor: this.layouterMonitor,
      temporarySettingsManager: this.temporarySettingsManager,
      diffedURIs,
      vSCodeConfigurator: this.vSCodeConfigurator,
      zoomManager: this.zoomManager,
    });
    this.layouter.onDidDeactivate(this.handleLayouterDidDeactivate.bind(this));
    await this.layouter.tryActivate(Zoom.default, oldLayouter !== undefined);
    this.activateSwitchLayoutStatusBarItem();
  }

  private async handleDidChangeVisibleTextEditors(editors: TextEditor[]) {
    for (const editor of editors) {
      await this.handleDidOpenURI(editor.document.uri);
    }
  }

  private async handleDidOpenURI(uRI: Uri): Promise<boolean> {
    if (this.layouter !== undefined && !this.layouter.isActive) {
      return false;
    }
    const diffedURIs = getDiffedURIs(uRI);
    if (diffedURIs === undefined || !(await filesExist(diffedURIs))) {
      return false;
    }
    if (this.layouter !== undefined && !this.layouter.isActive) {
      return false;
    }
    this.didMergetoolReact.fire();
    return await this.openDiffedURIs(diffedURIs);
  }

  private async handleLayouterDidDeactivate(layouter: DiffLayouter) {
    this.layouter = undefined;
    this.deactivateSwitchLayoutStatusBarItem();
    this.didLayoutDeactivate.fire(layouter);
    if (!layouter.wasInitiatedByMergetool) {
      const text = await new Promise<string | undefined>((resolve) =>
        readFile(layouter.diffedURIs.merged.fsPath, "utf8", (error, data) =>
          resolve(error ? undefined : data)
        )
      );
      if (text !== undefined && containsMergeConflictIndicators(text)) {
        const reopen = "Reopen";
        const keepClosed = "Keep closed";
        const result = await window.showWarningMessage(
          "Merge conflict markers are included in closed file.",
          reopen,
          keepClosed
        );
        if (
          result === reopen &&
          !(await this.openDiffedURIs(layouter.diffedURIs))
        ) {
          void window.showErrorMessage(
            "Opening failed, probably because one of the files was removed."
          );
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
      const restoreItem: MessageItem = {
        title: "Restore default",
      };
      const onceItem: MessageItem = {
        title: "Use default once",
      };
      const cancelItem: MessageItem = { title: "Cancel" };
      const selectedItem = await window.showErrorMessage(
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

  private async handleWasZoomRequested(zoom: Zoom): Promise<void> {
    await this.layouterManagerMonitor.enter();
    try {
      if (this.layouterManagerMonitor.someoneIsWaiting) {
        return;
      }
      if (!this.layouter?.isActive) {
        void window.showErrorMessage(
          "Diff layout must be active to use zoom commands."
        );
        return;
      }
      await this.layouter.setLayout(zoom);
    } finally {
      await this.layouterManagerMonitor.leave();
    }
  }
}

export const layoutSettingID = `${extensionID}.layout`;
export const deactivateLayoutCommandID = `${extensionID}.deactivateLayout`;
export const resetMergedFileCommandID = `${extensionID}.resetMergedFile`;
export const switchLayoutCommandID = `${extensionID}.switchLayout`;
