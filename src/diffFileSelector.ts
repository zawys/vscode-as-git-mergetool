import * as vscode from 'vscode';
import { DiffedURIs } from './diffedURIs';
import * as fs from 'fs';
import * as path from 'path';
import { getRealPath, getFileType, FileType, testFile } from './fsAsync';
import { R_OK, W_OK } from 'constants';
import { getWorkingDirectoryUri } from './getPaths';
import { defaultExtensionContextManager } from './extensionContextManager';
import { extensionID } from './iDs';

export class DiffFileSelector {
  public async doSelection(): Promise<DiffedURIs | undefined> {
    if (!await this.selector.doSelection()) { return undefined; }
    const uRIs = this.selectableFiles
      .map(file => this.selector.stateStore.getSelection(file.key));
    if (uRIs.some(uRI => uRI === undefined)) { return undefined; }
    return new DiffedURIs(uRIs[0]!, uRIs[1]!, uRIs[2]!, uRIs[3]!);
  }

  public get diffedURIs(): DiffedURIs | undefined { return this._diffedURIs; }

  public constructor(
    public readonly iD: string = `${extensionID}.mergeFileSelector`,
  ) {
    this.selector = new MultiFileSelector(
      this.selectableFiles,
      new FileSelectionStateStore(iD),
    );
  }

  private readonly selectableFiles: SelectableFile[] = [
    new SelectableFile(
      "base", "base", true, validateAsReadableFile,
    ),
    new SelectableFile(
      "local", "local", true, validateAsReadableFile,
    ),
    new SelectableFile(
      "remote", "remote", true, validateAsReadableFile,
    ),
    new SelectableFile(
      "merged", "merged", true, validateAsWritableEmptyFileLocation,
    )
  ];

  private readonly selector;
  private _diffedURIs: DiffedURIs | undefined;
}

export class MultiFileSelector {
  /**
   * Returns if the result was accepted.
   */
  public async doSelection(): Promise<boolean> {
    while (true) {
      const pickItems: FileOrActionPickItem[] = [];
      let allValid = true;
      for (let i = 0; i < this.selection.length; i++) {
        const file = this.selection[i];
        const uRI = this.stateStore.getSelection(file.key);
        const set = uRI !== undefined;
        const validationError =
          set && file.validate ? await file.validate(uRI!) : undefined;
        const comment = set ?
          (validationError || "") :
          (file.required ? "Required." : "Optional.");
        const value = set ? `\`${uRI!.fsPath}\`` : "unset";
        pickItems.push({
          fileIndex: i,
          label: `${firstLetterUppercase(file.label)}: ${value}`,
          detail: comment,
        });
        allValid &&= set ? validationError === undefined : !file.required;
      }
      if (allValid) { pickItems.push(this.acceptItem); }
      pickItems.push(this.unsetAll, this.abortItem);
      const result = await vscode.window.showQuickPick(pickItems, {
        ignoreFocusOut: true,
      });
      if (result === this.acceptItem) { return true; }
      if (result === this.unsetAll) {
        for (const file of this.selection) {
          this.stateStore.setSelection(file.key, undefined);
        }
        continue;
      }
      const fileIndex = result?.fileIndex;
      if (fileIndex === undefined) { return false; }
      const file = this.selection[fileIndex];
      const inputUri = await this.inputURI(file);
      if (inputUri === undefined) { continue; }
      this.stateStore.setSelection(
        file.key, inputUri === null ? undefined : inputUri
      );
    }
  }

  public constructor(
    public readonly selection: SelectableFile[],
    public readonly stateStore: FileSelectionStateStore,
    private readonly acceptItem: vscode.QuickPickItem = {
      label: "Accept selection",
      alwaysShow: true,
    },
    private readonly unsetAll: vscode.QuickPickItem = {
      label: "Clear selection",
      alwaysShow: true,
    },
    private readonly abortItem: vscode.QuickPickItem = {
      label: "Abort",
      alwaysShow: true,
    }
  ) { }

  /**
   *
   * @param file
   * @returns `undefined` means NOOP, `null` means unset.
   */
  private async inputURI(
    file: SelectableFile
  ): Promise<vscode.Uri | null | undefined> {
    const pasteItem: vscode.QuickPickItem = { label: "Type or paste" };
    const dialogItem: vscode.QuickPickItem = { label: "Use dialog" };
    const unsetItem: vscode.QuickPickItem = { label: "Unset" };
    const abortItem: vscode.QuickPickItem = { label: "Abort" };
    const result = await vscode.window.showQuickPick([pasteItem, dialogItem], {
      ignoreFocusOut: true,
    });
    if (result === undefined || result === abortItem) { return; }
    if (result === unsetItem) { return null; }
    if (result === pasteItem) {
      const result = await vscode.window.showInputBox({
        ignoreFocusOut: true,
        prompt:
          `Input ${file.required ? "required" : ""} path for ${file.label}.`,
        value: this.stateStore.getSelection(file.key)?.fsPath || "",
      });
      if (!result) { return undefined; }
      if (result.startsWith("./") || result.startsWith(".\\")) {
        const workingDir = getWorkingDirectoryUri();
        if (workingDir !== undefined) {
          return vscode.Uri.joinPath(workingDir, result);
        }
      }
      return vscode.Uri.file(result);
    } else {
      const result = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: this.stateStore.getSelection(file.key),
        openLabel: "Select",
        title: `Select ${file.required ? "required" : ""} ${file.label}`,
      });
      if (result === undefined || result.length === 0) { return undefined; }
      return result[0];
    }
  }
}

export async function validateAsReadableFile(
  uRI: vscode.Uri
): Promise<string | undefined> {
  const resolvedPath = await getRealPath(uRI.fsPath);
  if (resolvedPath === undefined) { return "Could not find file."; }
  const fileType = await getFileType(uRI.fsPath);
  if (fileType === undefined) { return "Could not test file."; }
  if (fileType !== FileType.regular) { return "Not a regular file."; }
  if (!await testFile(resolvedPath, R_OK)) {
    return "Cannot read file.";
  }
  return undefined;
}

export async function validateAsWritableEmptyFileLocation(
  uRI: vscode.Uri
): Promise<string | undefined> {
  const fileType = await getFileType(uRI.fsPath);
  if (fileType !== undefined
    && fileType !== FileType.notExisting
  ) { return "File exists. Select empty location."; }
  const parent = path.dirname(uRI.fsPath);
  if (!testFile(parent, W_OK)) { return "Cannot write parent directory."; }
}

export interface FileOrActionPickItem extends vscode.QuickPickItem {
  fileIndex?: number;
}
export interface FilePickItem extends FileOrActionPickItem {
  fileIndex: number;
}

export class SelectableFile {
  public constructor(
    public readonly key: string,
    public readonly label: string,
    public readonly required = false,
    public readonly validate?:
      (uRI: vscode.Uri) => string | undefined | Promise<string | undefined>,
  ) { }
}

export type FileSelectionState = { [key: string]: vscode.Uri | undefined };

export class FileSelectionStateStore {
  public getSelection(key: string): vscode.Uri | undefined {
    const keyID = this.getKeyID(key);
    const value =
      defaultExtensionContextManager.value.workspaceState.get(keyID);
    if (value === undefined) {
      return undefined;
    } else if (typeof value === 'string') {
      return vscode.Uri.file(value);
    }
    this.workspaceState.update(keyID, undefined);
    return undefined;
  }
  public setSelection(key: string, value: vscode.Uri | undefined) {
    this.workspaceState.update(this.getKeyID(key), value?.fsPath);
  }

  public constructor(
    public readonly iD: string,
    public readonly workspaceState =
      defaultExtensionContextManager.value.workspaceState,
  ) { }

  private getKeyID(key: string): string {
    return `${this.iD}.${key}`;
  }
}

function firstLetterUppercase(value: string): string {
  if (value.length === 0) { return value; }
  return value[0].toLocaleUpperCase() + value.substr(1);
}
