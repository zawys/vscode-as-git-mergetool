// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { TextDocumentContentProvider, Uri } from "vscode";
import { DocumentProviderManager } from "./documentProviderManager";
import { getContents } from "./fsHandy";

export class ReadonlyDocumentProvider implements TextDocumentContentProvider {
  public async provideTextDocumentContent(uri: Uri): Promise<string> {
    return (await getContents(uri.fsPath)) || "";
  }
  public readonlyFileURI(filePath: string): Uri {
    return Uri.file(filePath).with({ scheme: this.scheme });
  }
  constructor(public readonly scheme: string) {}
}

export function createReadonlyDocumentProviderManager(): DocumentProviderManager<
  ReadonlyDocumentProvider
> {
  const readonlyScheme = "readonly-file";
  return new DocumentProviderManager(
    readonlyScheme,
    new ReadonlyDocumentProvider(readonlyScheme)
  );
}
