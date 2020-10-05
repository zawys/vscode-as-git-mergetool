// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { Disposable, TextEditor, window } from "vscode";
import { occursIn } from "./diffedURIs";
import { DiffLayouterManager } from "./diffLayouterManager";
import { GitMergetoolReplacement } from "./gitMergetoolReplacement";
import { TemporaryFileOpenManager } from "./temporaryFileOpenManager";
import { isUIError, UIError } from "./uIError";

export class EditorOpenManager implements Disposable {
  public async register(): Promise<void> {
    this.disposables.push(
      window.onDidChangeVisibleTextEditors(
        this.handleDidChangeVisibleTextEditors.bind(this)
      )
    );
    for (const editor of window.visibleTextEditors) {
      if (await this.handleDidOpenEditor(editor)) {
        return;
      }
    }
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  public constructor(
    private readonly temporaryFileOpenManager: TemporaryFileOpenManager,
    private readonly gitMergetoolReplacement: GitMergetoolReplacement,
    private readonly diffLayouterManager: DiffLayouterManager
  ) {}

  private disposables: Disposable[] = [];

  private async handleDidChangeVisibleTextEditors(editors: TextEditor[]) {
    for (const editor of editors) {
      await this.handleDidOpenEditor(editor);
    }
  }
  private async handleDidOpenEditor(editor: TextEditor): Promise<boolean> {
    const uRI = editor.document.uri;
    const diffedURIs = this.diffLayouterManager.diffedURIs;
    if (diffedURIs !== undefined && occursIn(diffedURIs, uRI)) {
      return false;
    }
    // const gitMergetoolReplacementResult = await this.gitMergetoolReplacement.handleDidOpenURI(
    //   uRI
    // );
    // if (isUIError(gitMergetoolReplacementResult)) {
    //   this.showError(gitMergetoolReplacementResult);
    // } else if (gitMergetoolReplacementResult === true) {
    //   console.log(`Opened ${uRI.fsPath} with gitMergetoolReplacement`);
    //   return true;
    // }
    const temporaryFileOpenManagerResult = await this.temporaryFileOpenManager.handleDidOpenURI(
      uRI
    );
    if (isUIError(temporaryFileOpenManagerResult)) {
      this.showError(temporaryFileOpenManagerResult);
    } else if (temporaryFileOpenManagerResult === true) {
      console.log(`Opened ${uRI.fsPath} with temporaryFileOpenManager`);
      return true;
    }
    return false;
  }

  private showError(error: UIError): void {
    void window.showErrorMessage(
      `Could not check opened document status: ${error.message}`
    );
  }
}
