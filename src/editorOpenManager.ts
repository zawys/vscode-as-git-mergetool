// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { Disposable, TextEditor, window } from "vscode";
import { EditorOpenHandler } from "./editorOpenHandler";
import { RegisterableService } from "./registerableService";
import { isUIError, UIError } from "./uIError";

export class EditorOpenManager implements RegisterableService {
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
    private readonly editorOpenHandlers: ReadonlyArray<{
      handler: EditorOpenHandler;
      name: string;
    }>
  ) {}

  private disposables: Disposable[] = [];

  private async handleDidChangeVisibleTextEditors(editors: TextEditor[]) {
    for (const editor of editors) {
      await this.handleDidOpenEditor(editor);
    }
  }
  private async handleDidOpenEditor(editor: TextEditor): Promise<boolean> {
    const uRI = editor.document.uri;
    const fsPath = uRI.fsPath;
    for (const { handler } of this.editorOpenHandlers) {
      if (handler.ignorePathOverride(fsPath)) {
        return false;
      }
    }
    for (const { handler, name } of this.editorOpenHandlers) {
      const handleResult = await handler.handleDidOpenURI(uRI);
      if (isUIError(handleResult)) {
        this.showError(handleResult);
      } else if (handleResult === true) {
        console.log(`Opened ${uRI.fsPath} with ${name}`);
        return true;
      }
    }
    return false;
  }

  private showError(error: UIError): void {
    void window.showErrorMessage(
      `Could not check opened document status: ${error.message}`
    );
  }
}
