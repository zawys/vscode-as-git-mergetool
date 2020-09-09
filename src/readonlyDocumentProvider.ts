// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import {
  Disposable,
  TextDocumentContentProvider,
  Uri,
  workspace,
} from "vscode";
import { getContents } from "./fsHandy";

export const readonlyScheme = "readonly-file";

export class ReadonlyDocumentProvider implements TextDocumentContentProvider {
  async provideTextDocumentContent(uri: Uri): Promise<string> {
    return (await getContents(uri.fsPath)) || "";
  }
}

export class ReadonlyDocumentProviderManager implements Disposable {
  public register(): void {
    this.dispose();
    this.registration = workspace.registerTextDocumentContentProvider(
      readonlyScheme,
      new ReadonlyDocumentProvider()
    );
  }
  dispose(): void {
    this.registration?.dispose();
    this.registration = undefined;
  }

  private registration: Disposable | undefined;
}

export function readonlyFileURI(filePath: string): Uri {
  return Uri.file(filePath).with({ scheme: readonlyScheme });
}
