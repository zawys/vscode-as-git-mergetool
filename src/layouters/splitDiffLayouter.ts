// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as vscode from "vscode";
import { DiffedURIs } from "../diffedURIs";
import { extensionID } from "../ids";
import { mergeConflictIndicatorRE } from "../mergeConflictDetector";
import { Monitor } from "../monitor";
import { ScrollSynchronizer } from "../scrollSynchronizer";
import { TemporarySettingsManager } from "../temporarySettingsManager";
import { createUIError, UIError } from "../uIError";
import { VSCodeConfigurator } from "../vSCodeConfigurator";
import { Zoom, ZoomManager } from "../zoom";
import {
  DiffLayouter,
  DiffLayouterFactoryParameters,
  focusNextConflictCommandID,
  focusPreviousConflictCommandID,
  SearchType,
  watchDiffedURIs,
} from "./diffLayouter";

export class SplitDiffLayouter implements DiffLayouter {
  public async tryActivate(zoom: Zoom, onlyGrid = false): Promise<boolean> {
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
      if (!onlyGrid) {
        await this.temporarySettingsManager.activateSettings();
        await vscode.commands.executeCommand("workbench.action.closeSidebar");
        await vscode.commands.executeCommand("workbench.action.closePanel");
      }
      const layoutDescription = await this.setLayoutInner(zoom);

      const iterationState: ActivationIterationState = {
        editorIndex: 0,
        focussed: -1,
        alternativeFocussed: -1,
        mergeConflictFocussed: false,
      };
      await this.iterateOverLayout(
        layoutDescription,
        this.installNewDiffEditor.bind(this, iterationState),
        this.installNewNormalEditor.bind(this, iterationState)
      );
      this.remainingEditorCount = this.editors.length;
      if (
        this.mergeEditor !== undefined &&
        !iterationState.mergeConflictFocussed
      ) {
        void vscode.window.showInformationMessage(
          "The merged file does not contain conflict indicators."
        );
      }
      const focussed =
        iterationState.focussed === -1
          ? iterationState.alternativeFocussed
          : iterationState.focussed;
      if (focussed !== -1) {
        await focusColumn(focussed);
      }
      this._isActivating = false;
      this._isActive = true;
      this.watchingDisposables.push(
        vscode.window.onDidChangeVisibleTextEditors(
          this.handleDidChangeVisibleTextEditors.bind(this)
        )
      );
      await this.createScrollSynchronizer(this.mergeEditorIndex);
      this.watchingDisposables.push(...this.createStatusBarItems());
      this.zoomManager.createStatusBarItems(this.supportedZooms);
      return true;
    } finally {
      await this.monitor.leave();
    }
  }

  public async deactivate(
    onlyGrid = false,
    gridAndSidebarAreOk = false
  ): Promise<void> {
    await this.monitor.enter();
    try {
      if (!this.isEmployed) {
        return;
      }
      this._isActive = false;
      this.dispose();

      if (!gridAndSidebarAreOk) {
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
        if (!onlyGrid) {
          // focus sidebar to have it open
          await vscode.commands.executeCommand(
            "workbench.action.focusSideBar"
          );
          await vscode.commands.executeCommand(focusFirstEditorGroupCommandID);
        }
      }

      if (!onlyGrid) {
        await this.temporarySettingsManager.resetSettings();
      }

      this.editors = [];
      this.mergeEditor = undefined;
      this.mergeEditorIndex = undefined;
      this.remainingEditorCount = 0;
      this.editorsToSave = [];
      this._isEmployed = false;
    } finally {
      await this.monitor.leave();
    }
    this.didDeactivate.fire(this);
  }

  public async save(): Promise<void> {
    for (const editorToSave of this.editorsToSave) {
      await editorToSave.document.save();
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

  public focusMergeConflict(type: SearchType.first): boolean | UIError {
    if (this.mergeEditor === undefined) {
      return createUIError("No merge editor active.");
    }
    return cursorToMergeConflict(this.mergeEditor, type);
  }

  public dispose(): void {
    for (const disposable of this.watchingDisposables) {
      disposable.dispose();
    }
    this.watchingDisposables = [];
    this.zoomManager.removeStatusBarItems();
    this.scrollSynchronizer?.dispose();
    this.scrollSynchronizer = undefined;
  }

  public async setLayout(zoom: Zoom): Promise<void> {
    await this.monitor.enter();
    try {
      if (!this.isActive) {
        return;
      }
      this.scrollSynchronizer?.dispose();
      this.scrollSynchronizer = undefined;
      const layoutDescription = await this.setLayoutInner(zoom);
      let editorIndex = 0;
      const focussable: boolean[] = [];
      let focussed = -1;
      let alternativeFocussed = -1;
      const editorAction = (editorDescription: EditorDescription) => {
        focussable.push(!editorDescription.notFocussable);
        if (focussed === -1 && !editorDescription.notFocussable) {
          if (editorDescription.isMergeEditor) {
            focussed = editorIndex;
          } else if (alternativeFocussed === -1) {
            alternativeFocussed = editorIndex;
          }
        }
        editorIndex++;
      };
      await this.iterateOverLayout(
        layoutDescription,
        editorAction,
        editorAction
      );
      if (focussed === -1) {
        focussed = alternativeFocussed;
      }
      const activeEditorIndex = (this.editors as (
        | vscode.TextEditor
        | undefined
      )[]).indexOf(vscode.window.activeTextEditor);
      if (!focussable[activeEditorIndex]) {
        await focusColumn(focussed);
      } else {
        focussed = activeEditorIndex;
      }
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor === undefined) {
        focussed = -1;
      } else {
        activeEditor.revealRange(
          activeEditor.selection,
          vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
      }
      await this.createScrollSynchronizer(
        focussed === -1 ? undefined : focussed
      );
    } finally {
      await this.monitor.leave();
    }
  }

  public constructor(config: SplitDiffLayouterConfig) {
    this.createLayoutDescription = config.createLayoutDescription;
    this.diffedURIs = config.diffedURIs;
    this.monitor = config.monitor;
    this.supportedZooms = config.supportedZooms;
    this.temporarySettingsManager = config.temporarySettingsManager;
    this.vSCodeConfigurator = config.vSCodeConfigurator;
    this.zoomManager = config.zoomManager;
  }

  private readonly monitor: Monitor;
  public readonly diffedURIs: DiffedURIs;
  private readonly createLayoutDescription: (
    diffedURIs: DiffedURIs,
    zoom: Zoom
  ) => LayoutDescription;
  private readonly temporarySettingsManager: TemporarySettingsManager;
  private readonly vSCodeConfigurator: VSCodeConfigurator;
  private readonly zoomManager: ZoomManager;
  private readonly supportedZooms: Zoom[];

  private watchingDisposables: vscode.Disposable[] = [];
  private editors: vscode.TextEditor[] = [];
  private editorsToSave: vscode.TextEditor[] = [];
  private _isEmployed = false;
  private _isActive = false;
  private _isActivating = true;
  private readonly didDeactivate = new vscode.EventEmitter<DiffLayouter>();
  private mergeEditor: vscode.TextEditor | undefined;
  private mergeEditorIndex: number | undefined;
  private remainingEditorCount = 0;
  private _wasInitiatedByMergetool = false;
  private scrollSynchronizer: ScrollSynchronizer | undefined;

  private async createScrollSynchronizer(
    synchronizationSourceOnStartIndex?: number
  ) {
    this.scrollSynchronizer = await ScrollSynchronizer.create(
      this.editors,
      this.vSCodeConfigurator,
      synchronizationSourceOnStartIndex,
      1,
      undefined
    );
  }

  private async iterateOverLayout(
    layoutDescription: LayoutDescription,
    diffEditorAction: (
      diffEditorDescription: DiffEditorDescription
    ) => void | Promise<void>,
    normalEditorAction: (
      diffEditorDescription: NormalEditorDescription
    ) => void | Promise<void>
  ): Promise<void> {
    // iterate through editors in depth-first manner
    const stack: [EditorGroupDescription, number][] = [];
    let element: GroupOrEditorDescription = layoutDescription;
    let indexInGroup = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (element.type === LayoutElementType.diffEditor) {
        await diffEditorAction(element);
      } else if (element.type === LayoutElementType.normalEditor) {
        await normalEditorAction(element);
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
  }

  private async installNewDiffEditor(
    iterationState: ActivationIterationState,
    editorDescription: DiffEditorDescription
  ) {
    const { options } = await this.getOpenEditorOptions(
      iterationState,
      editorDescription.newUri,
      editorDescription
    );
    await vscode.commands.executeCommand(
      "vscode.diff",
      editorDescription.oldUri,
      editorDescription.newUri,
      editorDescription.title,
      options
    );
    this.installEditor(iterationState, editorDescription);
  }
  private async installNewNormalEditor(
    iterationState: ActivationIterationState,
    editorDescription: NormalEditorDescription
  ) {
    const { document, options } = await this.getOpenEditorOptions(
      iterationState,
      editorDescription.uri,
      editorDescription
    );
    const editor = await vscode.window.showTextDocument(document, options);
    this.installEditor(iterationState, editorDescription, editor);
  }
  private async getOpenEditorOptions(
    state: ActivationIterationState,
    uri: vscode.Uri,
    editorDescription: EditorDescription
  ): Promise<{
    document: vscode.TextDocument;
    options: vscode.TextDocumentShowOptions;
  }> {
    const document = await vscode.workspace.openTextDocument(uri);
    const selection =
      editorDescription.isMergeEditor && this.mergeEditor === undefined
        ? getMergeConflictFocusSelection(document, SearchType.first)
        : undefined;
    if (selection !== undefined) {
      state.mergeConflictFocussed = true;
    }
    const options = {
      viewColumn: state.editorIndex + 1,
      preview: false,
      selection,
      preserveFocus: false,
    };
    return { document, options };
  }
  private installEditor(
    state: {
      focussed: number;
      editorIndex: number;
      alternativeFocussed: number;
    },
    editorDescription: EditorDescription,
    editor?: vscode.TextEditor
  ) {
    if (state.focussed === -1 && !editorDescription.notFocussable) {
      if (editorDescription.isMergeEditor) {
        state.focussed = state.editorIndex;
      } else if (state.alternativeFocussed === -1) {
        state.alternativeFocussed = state.editorIndex;
      }
    }
    if (editor === undefined) {
      editor = vscode.window.activeTextEditor;
    }
    if (editor !== undefined) {
      this.editors.push(editor);
      if (editorDescription.isMergeEditor && this.mergeEditor === undefined) {
        this.mergeEditor = editor;
        this.mergeEditorIndex = state.editorIndex;
      }
      if (editorDescription.save) {
        this.editorsToSave.push(editor);
      }
    }
    state.editorIndex++;
  }
  private async setLayoutInner(zoom: Zoom): Promise<LayoutDescription> {
    const layoutDescription = this.createLayoutDescription(
      this.diffedURIs,
      zoom
    );
    await vscode.commands.executeCommand(
      "vscode.setEditorLayout",
      layoutDescription
    );
    return layoutDescription;
  }

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
      if (this.remainingEditorCount <= 0) {
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
      this.remainingEditorCount--;
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
    await this.deactivate(undefined, true);
  }
}
export function cursorToMergeConflict(
  editor: vscode.TextEditor,
  type: SearchType
): boolean {
  const selection = getMergeConflictFocusSelection(
    editor.document,
    type,
    editor.selection.start.line
  );
  if (selection === undefined) {
    return false;
  }
  editor.selection = selection;
  editor.revealRange(
    selection,
    type === SearchType.first
      ? vscode.TextEditorRevealType.AtTop
      : vscode.TextEditorRevealType.InCenterIfOutsideViewport
  );
  return true;
}
export function getMergeConflictFocusSelection(
  document: vscode.TextDocument,
  type: SearchType,
  currentSelectionStart = 0
): vscode.Selection | undefined {
  const lineCount = document.lineCount;
  const direction = type === SearchType.previous ? -1 : 1;
  const start =
    type === SearchType.first
      ? 0
      : (currentSelectionStart + direction + lineCount) % lineCount;
  let lineIndex = start;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const line = document.lineAt(lineIndex).text;
    if (mergeConflictIndicatorRE.test(line)) {
      const linePosition = new vscode.Position(lineIndex, 0);
      return new vscode.Selection(linePosition, linePosition);
    }
    lineIndex = (lineIndex + direction + lineCount) % lineCount;
    if (lineIndex === start) {
      return undefined;
    }
  }
}

export async function focusColumn(columnIndex: number): Promise<void> {
  const focusEditorGroupCommandID = focusEditorGroupCommandIDs[columnIndex];
  if (focusEditorGroupCommandID !== undefined) {
    await vscode.commands.executeCommand(focusEditorGroupCommandID);
  }
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

export enum LayoutElementType {
  editorGroup,
  diffEditor,
  normalEditor,
}

export interface LayoutElementDescription {
  type?: LayoutElementType;
  size?: number;
}

export type GroupOrEditorDescription =
  | EditorGroupDescription
  | DiffEditorDescription
  | NormalEditorDescription;

export interface EditorGroupDescription extends LayoutElementDescription {
  type?: LayoutElementType.editorGroup;
  groups: GroupOrEditorDescription[];
}

export interface EditorDescription extends LayoutElementDescription {
  save: boolean;
  notFocussable?: boolean;
  isMergeEditor?: boolean;
}

export interface DiffEditorDescription extends EditorDescription {
  type: LayoutElementType.diffEditor;
  oldUri: vscode.Uri;
  newUri: vscode.Uri;
  title: string;
}

export interface NormalEditorDescription extends EditorDescription {
  type: LayoutElementType.normalEditor;
  uri: vscode.Uri;
}

export interface LayoutDescription extends EditorGroupDescription {
  orientation: GroupOrientation;
}

export type LayoutEditorEventHandler = (
  editor: vscode.TextEditor,
  column: number,
  description: DiffEditorDescription
) => void | Promise<void>;

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

export interface SplitDiffLayouterSpecificConfig {
  readonly createLayoutDescription: (
    diffedURIs: DiffedURIs,
    zoom: Zoom
  ) => LayoutDescription;
  readonly supportedZooms: Zoom[];
}

export type SplitDiffLayouterConfig = DiffLayouterFactoryParameters &
  SplitDiffLayouterSpecificConfig;

interface ActivationIterationState {
  editorIndex: number;
  focussed: number;
  alternativeFocussed: number;
  mergeConflictFocussed: boolean;
}

export const focusPauseLengthOnCloseSettingID = `${extensionID}.workaroundFocusPauseLengthOnClose`;
export const quickLayoutDeactivationSettingID = `${extensionID}.workaroundQuickLayoutDeactivation`;
export const closeActiveEditorCommandID = "workbench.action.closeActiveEditor";
