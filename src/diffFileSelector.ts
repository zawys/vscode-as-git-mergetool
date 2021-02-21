import { R_OK, W_OK } from "constants";
import path from "path";
import { QuickPickItem, Uri, window } from "vscode";
import { defaultExtensionContextManager } from "./extensionContextManager";
import { FileType, getFileType, getRealPath, testFile } from "./fsHandy";
import { getWorkingDirectoryUri } from "./getPathsWithinVSCode";
import { extensionID, firstLetterUppercase } from "./ids";

export class DiffFileSelector {
  public async doSelection(): Promise<DiffFileSelectionResult | undefined> {
    const innerResult = await this.selector.doSelection();
    if (innerResult === undefined) {
      return undefined;
    }
    const result: {
      [k in DiffFileKey]?: FileSelectionResult<DiffFileKey>;
    } = {};
    for (const value of innerResult) {
      result[value.key] = value;
    }
    if (
      result.base === undefined ||
      result.local === undefined ||
      result.remote === undefined ||
      result.merged === undefined
    ) {
      return undefined;
    }
    return result as DiffFileSelectionResult;
  }

  public constructor(
    public readonly id: string = `${extensionID}.mergeFileSelector`
  ) {
    this.selector = new MultiFileSelector(
      this.selectableFiles,
      new FileSelectionStateStore(id)
    );
  }

  private readonly selectableFiles: SelectableFile<DiffFileKey>[] = [
    new SelectableFile("base", "base", true, validateAsReadableFile),
    new SelectableFile("local", "local", true, validateAsReadableFile),
    new SelectableFile("remote", "remote", true, validateAsReadableFile),
    new SelectableFile(
      "merged",
      "merged",
      true,
      validateAsExistingReadableOrEmptyWritableFileLocation
    ),
  ];

  private readonly selector: MultiFileSelector<DiffFileKey>;
}

export type DiffFileKey = "base" | "local" | "remote" | "merged";
export type DiffFileSelectionResult = {
  [k in DiffFileKey]: FileSelectionResult<DiffFileKey>;
};

export class MultiFileSelector<TKey extends string> {
  /**
   * Returns undefined iff the process was cancelled.
   * Otherwise it returns only valid data.
   */
  public async doSelection(): Promise<
    FileSelectionResult<TKey>[] | undefined
  > {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const [validationResults, pickItems] = await this.createPickItems();

      const pickResult = await window.showQuickPick(pickItems, {
        ignoreFocusOut: true,
      });
      if (pickResult === this.acceptItem) {
        const result: FileSelectionResult<TKey>[] = [];
        for (
          let fileIndex = 0;
          fileIndex < this.selectableFiles.length;
          fileIndex++
        ) {
          const vr = validationResults[fileIndex];
          if (vr?.valid === false) {
            return undefined;
          }
          const file = this.selectableFiles[fileIndex];
          const key = file.key;
          const path = await this.stateStore.getSelection(key);
          if (path === undefined) {
            return undefined;
          }
          result.push({
            key,
            fsPath: path,
            validationResult: vr,
          });
        }
        return result;
      } else if (pickResult === this.unsetAll) {
        for (const file of this.selectableFiles) {
          await this.stateStore.setSelection(file.key, undefined);
        }
        continue;
      }
      const fileIndex = pickResult?.fileIndex;
      if (fileIndex === undefined) {
        return undefined;
      }
      const file = this.selectableFiles[fileIndex];
      const inputUri = await this.inputURI(file);
      if (inputUri === undefined) {
        continue;
      }
      await this.stateStore.setSelection(
        file.key,
        inputUri === null ? undefined : inputUri
      );
    }
  }

  public constructor(
    public readonly selectableFiles: SelectableFile<TKey>[],
    public readonly stateStore: FileSelectionStateStore,
    private readonly acceptItem: QuickPickItem = {
      label: "$(check) Accept selection",
      alwaysShow: true,
    },
    private readonly unsetAll: QuickPickItem = {
      label: "$(discard) Clear selection",
      alwaysShow: true,
    },
    private readonly abortItem: QuickPickItem = {
      label: "$(close) Abort",
      alwaysShow: true,
    }
  ) {}

  private async createPickItems(): Promise<
    [(FileValidationResult | undefined)[], FileOrActionPickItem[]]
  > {
    const validationResults: (FileValidationResult | undefined)[] = [];
    const pickItems: FileOrActionPickItem[] = [];
    let allValid = true;
    for (
      let fileIndex = 0;
      fileIndex < this.selectableFiles.length;
      fileIndex++
    ) {
      const file = this.selectableFiles[fileIndex];
      const fsPath = await this.stateStore.getSelection(file.key);
      const validationResult =
        fsPath !== undefined && file.validate
          ? await file.validate(fsPath)
          : undefined;
      validationResults.push(validationResult);
      const comment =
        fsPath === undefined
          ? file.required
            ? "Required."
            : "Optional."
          : validationResult === undefined
          ? ""
          : validationResult.message !== undefined
          ? validationResult.message
          : validationResult.valid
          ? ""
          : "Error.";
      const value = fsPath !== undefined ? `\`${fsPath}\`` : "unset";
      pickItems.push({
        fileIndex,
        label: `${firstLetterUppercase(file.label)}: ${value}`,
        detail: comment,
      });
      allValid &&=
        fsPath !== undefined
          ? validationResult?.valid === true
          : !file.required;
    }
    if (allValid) {
      pickItems.push(this.acceptItem);
    }
    pickItems.push(this.unsetAll, this.abortItem);
    return [validationResults, pickItems];
  }

  /**
   *
   * @param file
   * @returns `undefined` means NOOP, `null` means unset.
   */
  private async inputURI(
    file: SelectableFile<TKey>
  ): Promise<string | null | undefined> {
    const pasteItem: QuickPickItem = {
      label: "Type or paste",
    };
    const dialogItem: QuickPickItem = { label: "Use dialog" };
    const unsetItem: QuickPickItem = { label: "Unset" };
    const abortItem: QuickPickItem = { label: "Abort" };
    const result = await window.showQuickPick([pasteItem, dialogItem], {
      ignoreFocusOut: true,
    });
    if (result === undefined || result === abortItem) {
      return;
    }
    if (result === unsetItem) {
      return null;
    }
    if (result === pasteItem) {
      const result = await window.showInputBox({
        ignoreFocusOut: true,
        prompt: `Input ${file.required ? "required" : ""} path for ${
          file.label
        }.`,
        value:
          (await this.stateStore.getSelection(file.key)) ||
          (await this.getDefaultPath()),
      });
      if (!result) {
        return undefined;
      }
      if (result.startsWith("./") || result.startsWith(".\\")) {
        const workingDirectory = getWorkingDirectoryUri()?.fsPath;
        if (workingDirectory !== undefined) {
          return path.join(workingDirectory, result);
        }
      }
      return result;
    } else {
      const fSPath = await this.stateStore.getSelection(file.key);
      let defaultURI =
        fSPath === undefined ? undefined : Uri.file(path.dirname(fSPath));
      if (!defaultURI) {
        const defaultPath = await this.getDefaultPath();
        if (defaultPath !== undefined) {
          defaultURI = Uri.file(defaultPath);
        }
      }
      const result = await window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        defaultUri: defaultURI,
        openLabel: "Select",
        title: `Select ${file.required ? "required" : ""} ${file.label}`,
      });
      if (result === undefined || result.length === 0) {
        return undefined;
      }
      return result[0].fsPath;
    }
  }

  private async getDefaultPath(): Promise<string | undefined> {
    for (const file of this.selectableFiles) {
      const fSPath = await this.stateStore.getSelection(file.key);
      if (fSPath !== undefined) {
        return fSPath;
      }
    }
    return undefined;
  }
}

export class SelectableFile<TKey extends string> {
  public constructor(
    public readonly key: TKey,
    public readonly label: string,
    public readonly required = false,
    public readonly validate?: (
      fsPath: string
    ) => Promise<FileValidationResult>
  ) {}
}

export interface FileValidationResult {
  valid: boolean;
  message?: string;
  readable?: boolean;
  writable?: boolean;
  emptyLoc?: boolean;
}
export interface FileSelectionResult<TKey extends string> {
  key: TKey;
  validationResult?: FileValidationResult;
  fsPath: string;
}

async function validateAsReadableFile(
  fsPath: string
): Promise<FileValidationResult> {
  const resolvedPath = await getRealPath(fsPath);
  if (resolvedPath === undefined) {
    return fileValidationResultFromErrorMessage("Could not find file.");
  }
  const fileType = await getFileType(resolvedPath);
  if (fileType === undefined) {
    return fileValidationResultFromErrorMessage("Could not test file.");
  }
  if (fileType !== FileType.regular) {
    return fileValidationResultFromErrorMessage("Not a regular file.");
  }
  if (!(await testFile(resolvedPath, R_OK))) {
    return fileValidationResultFromErrorMessage("Cannot read file.");
  }
  return { valid: true, readable: true, emptyLoc: false };
}

async function validateAsExistingReadableOrEmptyWritableFileLocation(
  fsPath: string
): Promise<FileValidationResult> {
  const fileType = await getFileType(fsPath);
  if (fileType !== undefined && fileType !== FileType.notExisting) {
    const resolvedPath = await getRealPath(fsPath);
    if (resolvedPath === undefined) {
      return fileValidationResultFromErrorMessage(
        "Error resolving existing file."
      );
    }
    const fileType = await getFileType(resolvedPath);
    if (fileType === undefined) {
      return fileValidationResultFromErrorMessage("Could not test file.");
    }
    if (fileType !== FileType.regular) {
      return fileValidationResultFromErrorMessage(
        "Existing and not a regular file."
      );
    }
    if (!(await testFile(resolvedPath, R_OK))) {
      return fileValidationResultFromErrorMessage("Cannot read file.");
    }
    const writable = !(await testFile(resolvedPath, W_OK));
    return {
      valid: true,
      writable,
      readable: true,
      emptyLoc: false,
      message: "File will not be overwritten; only loaded.",
    };
  }
  const parent = path.dirname(fsPath);
  if (!(await testFile(parent, W_OK))) {
    return fileValidationResultFromErrorMessage(
      "Cannot write parent directory."
    );
  }
  return {
    valid: true,
    writable: true,
    readable: false,
    emptyLoc: true,
  };
}

function fileValidationResultFromErrorMessage(
  message: string
): FileValidationResult {
  return { valid: false, message };
}

export interface FileOrActionPickItem extends QuickPickItem {
  fileIndex?: number;
}
export interface FilePickItem extends FileOrActionPickItem {
  fileIndex: number;
}

export type FileSelectionState = {
  [key: string]: Uri | undefined;
};

export class FileSelectionStateStore {
  public async getSelection(key: string): Promise<string | undefined> {
    const keyID = this.getKeyID(key);
    const value = defaultExtensionContextManager.value.workspaceState.get(
      keyID
    );
    if (value === undefined) {
      return undefined;
    } else if (typeof value === "string") {
      return value;
    }
    await this.workspaceState.update(keyID, undefined);
    return undefined;
  }

  public async setSelection(
    key: string,
    value: string | undefined
  ): Promise<void> {
    await this.workspaceState.update(this.getKeyID(key), value);
  }

  public constructor(
    public readonly id: string,
    public readonly workspaceState = defaultExtensionContextManager.value
      .workspaceState
  ) {}

  private getKeyID(key: string): string {
    return `${this.id}.${key}`;
  }
}
