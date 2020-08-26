import * as vscode from 'vscode';
import { DiffedURIs } from './diffedURIs';
import { Monitor } from './monitor';
import { DiffLayouter, watchDiffedURIs, SearchType, focusPreviousConflictCommandID, focusNextConflictCommandID } from './diffLayouter';
import { ScrollSynchronizer } from './scrollSynchronizer';
import { defaultTemporarySideBySideSettingsManager } from './temporarySettingsManager';
import { defaultVSCodeConfigurator } from './vSCodeConfigurator';
import { mergeConflictIndicatorRE } from './mergeConflictDetector';

export class SplitDiffLayouter implements DiffLayouter {
  public async tryActivate(): Promise<boolean> {
    await this.monitor.enter();
    try {
      if (this.monitor.someoneIsWaiting || this._isEmployed) { return false; }
      this._isEmployed = true;
      this._isActivating = true;
      this.watchingDisposables.push(
        ...watchDiffedURIs(this.diffedURIs, () => this.deactivate())
      );
      const layoutDescription = this.createLayoutDescription(this.diffedURIs);
      await vscode.commands.executeCommand("workbench.action.closeSidebar");
      await vscode.commands.executeCommand("workbench.action.closePanel");
      await vscode.commands.executeCommand(
        "vscode.setEditorLayout", layoutDescription,
      );
      await this.temporarySideBySideSettingsManager.activateSettings();

      // iterate through editors in depth-first manner
      const stack: [EditorGroupDescription, number][] = [];
      let element: GroupOrEditorDescription = layoutDescription;
      let indexInGroup = 0;
      let column = 1;
      while (true) {
        if (element.type === diffEditorSymbol) {
          await vscode.commands.executeCommand("vscode.diff",
            element.oldUri, element.newUri, element.title,
            {
              viewColumn: column,
              preview: true,
              preserveFocus: false,
            },
          );
          const editor = vscode.window.activeTextEditor;
          if (editor !== undefined) {
            if (element.isMergeEditor) {
              this.mergeEditor = editor;
              this.mergeEditorIndex = this.editors.length;
            }
            this.editors.push(editor);
            if (element.save) { this.editorsToSave.push(editor); }
          }
          column++;
        } else if (indexInGroup < element.groups.length) {
          stack.push([element, indexInGroup + 1]);
          element = element.groups[indexInGroup];
          indexInGroup = 0;
          continue;
        }
        const top = stack.pop();
        if (top === undefined) { break; }
        [element, indexInGroup] = top;
      }

      this.remainingEditors = this.editors.length;
      if (this.mergeEditor !== undefined
        && this.mergeEditorIndex !== undefined
      ) {
        focusMergeConflict(this.mergeEditor, SearchType.first);
        await focusColumn(this.mergeEditorIndex);
      }
      this._isActivating = false;
      this._isActive = true;
      this.watchingDisposables.push(
        vscode.window.onDidChangeVisibleTextEditors(
          this.handleDidChangeVisibleTextEditors.bind(this)
        ),
      );
      this.watchingDisposables.push(
        await ScrollSynchronizer.create(this.editors, this.mergeEditorIndex),
        ...this.createStatusBarItems()
      );
      return true;
    } finally {
      await this.monitor.leave();
    }
  }

  public async deactivate(gridIsOk = false) {
    await this.monitor.enter();
    try {
      if (!this.isEmployed) { return; }
      this._isActive = false;
      for (const disposable of this.watchingDisposables) {
        disposable.dispose();
      }
      this.watchingDisposables = [];

      if (!gridIsOk) {
        // focus sidebar to have it open
        await vscode.commands.executeCommand("workbench.action.focusSideBar");

        if (this.vSCodeConfigurator.get<boolean>(
          quickLayoutDeactivationSettingID
        )) {
          await vscode.commands.executeCommand(
            "vscode.setEditorLayout", { groups: [{}] }
          );
          await this.closeTopEditorOfEachGroupIfOurs(false);
        } else {
          await this.closeTopEditorOfEachGroupIfOurs();
        }
      }

      await this.temporarySideBySideSettingsManager.resetSettings();

      this.editors = [];
      this.mergeEditor = undefined;
      this.mergeEditorIndex = undefined;
      this.remainingEditors = 0;
      this.editorsToSave = [];
      this._isEmployed = false;
    } finally {
      await this.monitor.leave();
    }
    this.didDeactivate.fire(this);
  }

  public async save(): Promise<void> {
    for (let i = 0; i < this.editorsToSave.length; i++) {
      await this.editorsToSave[i].document.save();
    }
  }

  public get isEmployed() { return this._isEmployed; }
  public get isActive() { return this._isActive; }
  public get isActivating() { return this._isActivating; }

  public get onDidDeactivate(): vscode.Event<DiffLayouter> {
    return this.didDeactivate.event;
  }

  public get wasInitiatedByMergetool(): boolean {
    return this._wasInitiatedByMergetool;
  }
  public setWasInitiatedByMergetool() {
    this._wasInitiatedByMergetool = true;
  }

  public focusMergeConflict(type: SearchType.first): boolean | undefined {
    if (this.mergeEditor === undefined) { return undefined; }
    return focusMergeConflict(this.mergeEditor, type);
  }

  public constructor(
    private readonly monitor: Monitor,
    public readonly diffedURIs: DiffedURIs,
    private readonly createLayoutDescription:
      (diffedURIs: DiffedURIs) => LayoutDescription,
    private readonly temporarySideBySideSettingsManager =
      defaultTemporarySideBySideSettingsManager,
    private readonly vSCodeConfigurator = defaultVSCodeConfigurator,
  ) { }

  private watchingDisposables: vscode.Disposable[] = [];
  private editors: vscode.TextEditor[] = [];
  private editorsToSave: vscode.TextEditor[] = [];
  private _isEmployed: boolean = false;
  private _isActive: boolean = false;
  private _isActivating: boolean = true;
  private readonly didDeactivate =
    new vscode.EventEmitter<DiffLayouter>();
  private mergeEditor: vscode.TextEditor | undefined;
  private mergeEditorIndex: number | undefined;
  private remainingEditors = 0;
  private _wasInitiatedByMergetool = false;

  private createStatusBarItems(): vscode.StatusBarItem[] {
    let priority = 10;
    const items: vscode.StatusBarItem[] = [];
    const addSBI = (text: string, command?: string, tooltip?: string) => {
      const item = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left, priority--
      );
      item.text = text;
      item.command = command;
      item.tooltip = tooltip;
      items.push(item);
    };
    addSBI("Merge conflict:");
    addSBI("$(arrow-up)", focusPreviousConflictCommandID,
      "Focus previous merge conflict"
    );
    addSBI("$(arrow-down)", focusNextConflictCommandID,
      "Focus next merge conflict"
    );
    if (
      !this.vSCodeConfigurator.get("merge-conflict.codeLens.enabled") ||
      !this.vSCodeConfigurator.get("diffEditor.codeLens")
    ) {
      addSBI("accept:");
      addSBI("current", "merge-conflict.accept.current",
        "Accept current (local) changes of focused merge conflict"
      );
      addSBI("incoming", "merge-conflict.accept.incoming",
        "Accept incoming (remote) changes of focused merge conflict"
      );
      addSBI("both", "merge-conflict.accept.both",
        "Accept both changes of focused merge conflict"
      );
    }
    for (const item of items) { item.show(); }
    return items;
  }

  private async closeTopEditorOfEachGroupIfOurs(
    switchGroups = true,
    pauseAtBeginning = true
  ) {
    if (switchGroups && pauseAtBeginning) {
      await this.pause(
        "Workaround: Waiting for focus switch",
        this.vSCodeConfigurator.get<number>(
          focusPauseLenghtOnCloseSettingID
        ) || 500
      );
    }
    if (switchGroups) {
      await vscode.commands.executeCommand(
        "workbench.action.focusLastEditorGroup"
      );
    }
    let remainingLastSwitch = false;
    let remainingPrevSwitches = this.editors.length - 1;
    while (true) {
      const didClose = await this.closeTopEditorIfOurs();
      if (this.remainingEditors <= 0) { break; }
      if (didClose) {
        remainingLastSwitch = true;
        remainingPrevSwitches = this.editors.length - 1;
        continue;
      }
      if (!switchGroups || remainingPrevSwitches <= 0) { break; }
      if (remainingLastSwitch) {
        await vscode.commands.executeCommand(
          "workbench.action.focusLastEditorGroup"
        );
        remainingLastSwitch = false;
      } else {
        await vscode.commands.executeCommand(
          "workbench.action.focusPreviousGroup"
        );
        remainingPrevSwitches--;
      }
    }
  }

  private async closeTopEditorIfOurs(): Promise<boolean> {
    // Editors seem to be recreated sometimes
    // when previously covered by other editors.
    // So, reference equality comparison with the other editor
    // leads to false negatives.
    // Comparing by document leads to false positives, however.
    // Is there a solution without VS Code API change?
    const activeDoc = vscode.window.activeTextEditor?.document;
    if (activeDoc !== undefined
      && this.editors.some(editor => editor.document === activeDoc)
    ) {
      await vscode.commands.executeCommand(closeActiveEditorCommandID);
      this.remainingEditors--;
      return true;
    }
    return false;
  }

  private async pause(msg: string, time: number) {
    vscode.window.setStatusBarMessage(msg, time);
    await new Promise(r => setTimeout(r, time));
  }

  private async handleDidChangeVisibleTextEditors() {
    if (!this._isActive) { return; }
    this._isActive = false;

    // focus sidebar to have it open
    await vscode.commands.executeCommand("workbench.action.focusSideBar");

    await vscode.commands.executeCommand(
      "workbench.action.moveEditorToLastGroup"
    );
    await focusColumn(0);
    await this.closeTopEditorIfOurs();
    await vscode.commands.executeCommand(
      "workbench.action.focusLastEditorGroup"
    );
    await vscode.commands.executeCommand(
      "workbench.action.moveEditorToFirstGroup"
    );
    await this.closeTopEditorOfEachGroupIfOurs(true, false);
    await this.deactivate(true);
  }
}
export function focusMergeConflict(
  editor: vscode.TextEditor, type: SearchType
): boolean {
  const doc = editor.document;
  const lineCount = doc.lineCount;
  const direction = type === SearchType.previous ? -1 : 1;
  const start = type === SearchType.first ?
    0 :
    (editor.selection.start.line + direction + lineCount) % lineCount;
  let lineIndex = start;
  while (true) {
    const line = doc.lineAt(lineIndex).text;
    if (mergeConflictIndicatorRE.test(line)) {
      const linePosition = new vscode.Position(lineIndex, 0);
      editor.revealRange(
        new vscode.Range(linePosition, linePosition),
        vscode.TextEditorRevealType.AtTop
      );
      editor.selection = new vscode.Selection(linePosition, linePosition);
      return true;
    }
    lineIndex = (lineIndex + direction + lineCount) % lineCount;
    if (lineIndex === start) {
      return false;
    }
  }
}

export async function focusColumn(column: number) {
  const focusEditorGroupCommandID = focusEditorGroupCommandIDs[column];
  if (focusEditorGroupCommandID !== undefined) {
    await vscode.commands.executeCommand(focusEditorGroupCommandID);
  }
}

export interface LayoutDescription extends EditorGroupDescription {
  orientation: GroupOrientation;
}

/**
 * Copied from
 * vscode/src/vs/workbench/services/editor/common/editorGroupsService.ts
 */
export const enum GroupOrientation {
  /**
   * Distribute splits along horizontal axis; cut space vertically.
   */
  horizontal,
  /**
   * Distribute splits along vertical axis; cut space horizontally.
   */
  vertical
}

export interface EditorGroupDescription extends LayoutElementDescription {
  type?: never;
  groups: GroupOrEditorDescription[];
}

export type DiffEditorType = 'diffEditor';
export const diffEditorSymbol: DiffEditorType = 'diffEditor';

export interface DiffEditorDescription extends LayoutElementDescription {
  type: DiffEditorType;
  oldUri: vscode.Uri;
  newUri: vscode.Uri;
  title: string;
  save: boolean;
  isMergeEditor?: boolean;
}

export type LayoutEditorEventHandler = (
  editor: vscode.TextEditor,
  column: number,
  description: DiffEditorDescription,
) => void | Promise<void>;

export interface LayoutElementDescription {
  size?: number;
}

export type GroupOrEditorDescription =
  EditorGroupDescription | DiffEditorDescription;

const focusEditorGroupCommandIDs:
  { [key: number]: string | undefined } =
{
  0: "workbench.action.focusFirstEditorGroup",
  1: "workbench.action.focusSecondEditorGroup",
  2: "workbench.action.focusThirdEditorGroup",
  3: "workbench.action.focusFourthEditorGroup",
  4: "workbench.action.focusFifthEditorGroup",
  5: "workbench.action.focusSixthEditorGroup",
  6: "workbench.action.focusSeventhEditorGroup",
  7: "workbench.action.focusEighthEditorGroup",
};

const focusPauseLenghtOnCloseSettingID =
  "vscode-as-git-mergetool.workaroundFocusPauseLengthOnClose";
const quickLayoutDeactivationSettingID =
  "vscode-as-git-mergetool.workaroundQuickLayoutDeactivation";
const closeActiveEditorCommandID =
  "workbench.action.closeActiveEditor";
