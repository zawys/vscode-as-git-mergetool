import * as vscode from "vscode";
import { DiffedURIs } from "../diffedURIs";
import { extensionID } from "../iDs";
import { mergeConflictIndicatorRE } from "../mergeConflictDetector";
import { Monitor } from "../monitor";
import { ScrollSynchronizer } from "../scrollSynchronizer";
import { defaultTemporarySideBySideSettingsManagerLazy } from "../temporarySettingsManager";
import { defaultVSCodeConfigurator } from "../vSCodeConfigurator";
import {
  DiffLayouter,
  focusNextConflictCommandID,
  focusPreviousConflictCommandID,
  SearchType,
  watchDiffedURIs,
} from "./diffLayouter";

export class SplitDiffLayouter implements DiffLayouter {
  public async tryActivate(): Promise<boolean> {
    await this.monitor.enter();
    try {
      if (this.monitor.someoneIsWaiting || this._isEmployed) {
        return false;
      }
      this._isEmployed = true;
      this._isActivating = true;
      this.watchingDisposables.push(
        ...watchDiffedURIs(this.diffedURIs, () => void this.deactivate())
      );
      await this.temporarySideBySideSettingsManager.activateSettings();
      const layoutDescription = this.createLayoutDescription(this.diffedURIs);
      await vscode.commands.executeCommand("workbench.action.closeSidebar");
      await vscode.commands.executeCommand("workbench.action.closePanel");
      await vscode.commands.executeCommand(
        "vscode.setEditorLayout",
        layoutDescription
      );

      // iterate through editors in depth-first manner
      const stack: [EditorGroupDescription, number][] = [];
      let element: GroupOrEditorDescription = layoutDescription;
      let indexInGroup = 0;
      let column = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (element.type === diffEditorSymbol) {
          await vscode.commands.executeCommand(
            "vscode.diff",
            element.oldUri,
            element.newUri,
            element.title,
            {
              viewColumn: column,
              preview: true,
              preserveFocus: false,
            }
          );
          const editor = vscode.window.activeTextEditor;
          if (editor !== undefined) {
            if (element.isMergeEditor) {
              this.mergeEditor = editor;
              this.mergeEditorIndex = this.editors.length;
            }
            this.editors.push(editor);
            if (element.save) {
              this.editorsToSave.push(editor);
            }
          }
          column++;
        } else if (indexInGroup < element.groups.length) {
          stack.push([element, indexInGroup + 1]);
          element = element.groups[indexInGroup];
          indexInGroup = 0;
          continue;
        }
        const top = stack.pop();
        if (top === undefined) {
          break;
        }
        [element, indexInGroup] = top;
      }

      this.remainingEditors = this.editors.length;
      if (
        this.mergeEditor !== undefined &&
        this.mergeEditorIndex !== undefined
      ) {
        if (!focusMergeConflict(this.mergeEditor, SearchType.first)) {
          void vscode.window.showInformationMessage(
            "The merged file does not contain conflict indicators."
          );
        }
        await focusColumn(this.mergeEditorIndex);
      }
      this._isActivating = false;
      this._isActive = true;
      this.watchingDisposables.push(
        vscode.window.onDidChangeVisibleTextEditors(
          this.handleDidChangeVisibleTextEditors.bind(this)
        )
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

  public async deactivate(gridIsOk = false): Promise<void> {
    await this.monitor.enter();
    try {
      if (!this.isEmployed) {
        return;
      }
      this._isActive = false;
      for (const disposable of this.watchingDisposables) {
        disposable.dispose();
      }
      this.watchingDisposables = [];

      if (!gridIsOk) {
        if (
          this.vSCodeConfigurator.get(quickLayoutDeactivationSettingID) ===
          true
        ) {
          await vscode.commands.executeCommand("vscode.setEditorLayout", {
            groups: [{}],
          });
          await this.closeTopEditorOfEachGroupIfOurs(false);
        } else {
          await this.closeTopEditorOfEachGroupIfOurs();
        }
        // focus sidebar to have it open
        await vscode.commands.executeCommand("workbench.action.focusSideBar");
        await vscode.commands.executeCommand(focusFirstEditorGroupCommandID);
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

  public get isEmployed(): boolean {
    return this._isEmployed;
  }
  public get isActive(): boolean {
    return this._isActive;
  }
  public get isActivating(): boolean {
    return this._isActivating;
  }

  public get onDidDeactivate(): vscode.Event<DiffLayouter> {
    return this.didDeactivate.event;
  }

  public get wasInitiatedByMergetool(): boolean {
    return this._wasInitiatedByMergetool;
  }
  public setWasInitiatedByMergetool(): void {
    this._wasInitiatedByMergetool = true;
  }

  public focusMergeConflict(type: SearchType.first): boolean | undefined {
    if (this.mergeEditor === undefined) {
      return undefined;
    }
    return focusMergeConflict(this.mergeEditor, type);
  }

  public constructor(
    private readonly monitor: Monitor,
    public readonly diffedURIs: DiffedURIs,
    private readonly createLayoutDescription: (
      diffedURIs: DiffedURIs
    ) => LayoutDescription,
    private readonly temporarySideBySideSettingsManager = defaultTemporarySideBySideSettingsManagerLazy.value,
    private readonly vSCodeConfigurator = defaultVSCodeConfigurator
  ) {}

  private watchingDisposables: vscode.Disposable[] = [];
  private editors: vscode.TextEditor[] = [];
  private editorsToSave: vscode.TextEditor[] = [];
  private _isEmployed = false;
  private _isActive = false;
  private _isActivating = true;
  private readonly didDeactivate = new vscode.EventEmitter<DiffLayouter>();
  private mergeEditor: vscode.TextEditor | undefined;
  private mergeEditorIndex: number | undefined;
  private remainingEditors = 0;
  private _wasInitiatedByMergetool = false;

  private createStatusBarItems(): vscode.StatusBarItem[] {
    let priority = 10;
    const items: vscode.StatusBarItem[] = [];
    const addSBI = (text: string, command?: string, tooltip?: string) => {
      const item = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        priority--
      );
      item.text = text;
      item.command = command;
      item.tooltip = tooltip;
      items.push(item);
    };
    addSBI("Merge conflict:");
    addSBI(
      "$(arrow-up)",
      focusPreviousConflictCommandID,
      "Focus previous merge conflict"
    );
    addSBI(
      "$(arrow-down)",
      focusNextConflictCommandID,
      "Focus next merge conflict"
    );
    if (
      !this.vSCodeConfigurator.get("merge-conflict.codeLens.enabled") ||
      !this.vSCodeConfigurator.get("diffEditor.codeLens")
    ) {
      addSBI("accept:");
      addSBI(
        "current",
        "merge-conflict.accept.current",
        "Accept current (local) changes of focused merge conflict"
      );
      addSBI(
        "incoming",
        "merge-conflict.accept.incoming",
        "Accept incoming (remote) changes of focused merge conflict"
      );
      addSBI(
        "both",
        "merge-conflict.accept.both",
        "Accept both changes of focused merge conflict"
      );
    }
    for (const item of items) {
      item.show();
    }
    return items;
  }

  private async closeTopEditorOfEachGroupIfOurs(
    switchGroups = true,
    pauseAtBeginning = true
  ) {
    if (switchGroups && pauseAtBeginning) {
      const pauseLength = this.vSCodeConfigurator.get(
        focusPauseLengthOnCloseSettingID
      );
      await this.pause(
        "Workaround: Waiting for focus switch",
        typeof pauseLength === "number" ? pauseLength : 500
      );
    }
    if (switchGroups) {
      await vscode.commands.executeCommand(
        "workbench.action.focusLastEditorGroup"
      );
    }
    let remainingLastSwitch = false;
    let remainingPreviousSwitches = this.editors.length - 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const didClose = await this.closeTopEditorIfOurs();
      if (this.remainingEditors <= 0) {
        break;
      }
      if (didClose) {
        remainingLastSwitch = true;
        remainingPreviousSwitches = this.editors.length - 1;
        continue;
      }
      if (!switchGroups || remainingPreviousSwitches <= 0) {
        break;
      }
      if (remainingLastSwitch) {
        await vscode.commands.executeCommand(
          "workbench.action.focusLastEditorGroup"
        );
        remainingLastSwitch = false;
      } else {
        await vscode.commands.executeCommand(
          "workbench.action.focusPreviousGroup"
        );
        remainingPreviousSwitches--;
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
    const activeDocument = vscode.window.activeTextEditor?.document;
    if (
      activeDocument !== undefined &&
      this.editors.some((editor) => editor.document === activeDocument)
    ) {
      await vscode.commands.executeCommand(closeActiveEditorCommandID);
      this.remainingEditors--;
      return true;
    }
    return false;
  }

  private async pause(message: string, time: number) {
    vscode.window.setStatusBarMessage(message, time);
    await new Promise((resolve) => setTimeout(resolve, time));
  }

  private async handleDidChangeVisibleTextEditors() {
    if (!this._isActive) {
      return;
    }
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
  editor: vscode.TextEditor,
  type: SearchType
): boolean {
  const document = editor.document;
  const lineCount = document.lineCount;
  const direction = type === SearchType.previous ? -1 : 1;
  const start =
    type === SearchType.first
      ? 0
      : (editor.selection.start.line + direction + lineCount) % lineCount;
  let lineIndex = start;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const line = document.lineAt(lineIndex).text;
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

export async function focusColumn(column: number): Promise<void> {
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
  vertical,
}

export interface EditorGroupDescription extends LayoutElementDescription {
  type?: never;
  groups: GroupOrEditorDescription[];
}

export type DiffEditorType = "diffEditor";
export const diffEditorSymbol: DiffEditorType = "diffEditor";

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
  description: DiffEditorDescription
) => void | Promise<void>;

export interface LayoutElementDescription {
  size?: number;
}

export type GroupOrEditorDescription =
  | EditorGroupDescription
  | DiffEditorDescription;

const focusFirstEditorGroupCommandID =
  "workbench.action.focusFirstEditorGroup";
const focusEditorGroupCommandIDs: {
  [key: number]: string | undefined;
} = {
  0: focusFirstEditorGroupCommandID,
  1: "workbench.action.focusSecondEditorGroup",
  2: "workbench.action.focusThirdEditorGroup",
  3: "workbench.action.focusFourthEditorGroup",
  4: "workbench.action.focusFifthEditorGroup",
  5: "workbench.action.focusSixthEditorGroup",
  6: "workbench.action.focusSeventhEditorGroup",
  7: "workbench.action.focusEighthEditorGroup",
};

const focusPauseLengthOnCloseSettingID = `${extensionID}.workaroundFocusPauseLengthOnClose`;
const quickLayoutDeactivationSettingID = `${extensionID}.workaroundQuickLayoutDeactivation`;
const closeActiveEditorCommandID = "workbench.action.closeActiveEditor";
