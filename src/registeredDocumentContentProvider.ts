// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { ProviderResult, TextDocumentContentProvider, Uri } from "vscode";
import { DocumentProviderManager } from "./documentProviderManager";
import { showInternalError } from "./showInternalError";

export class RegisteredDocumentContentProvider
  implements TextDocumentContentProvider {
  public provideTextDocumentContent(uRI: Uri): ProviderResult<string> {
    if (uRI.scheme !== this.scheme) {
      return undefined;
    }
    return this.contents[uRI.path];
  }

  public registerDocumentContent(content: string): Uri {
    const key = (this.nextID++).toString();
    this.contents[key] = content;
    return Uri.parse("").with({ scheme: this.scheme, path: key });
  }
  public unregisterDocumentContent(uRI: Uri): void {
    if (uRI.scheme !== this.scheme) {
      showInternalError("tried to unregister URI with unexpected scheme");
      return;
    }
    delete this.contents[uRI.path];
  }
  public getEmptyDocumentURI(): Uri {
    if (this.emptyDocumentURI === undefined) {
      this.emptyDocumentURI = this.registerDocumentContent("");
    }
    return this.emptyDocumentURI;
  }

  public constructor(public readonly scheme: string) {}

  private readonly contents: { [k in string]?: string } = {};
  private nextID = 0;
  private emptyDocumentURI: Uri | undefined;
}

export function createRegisteredDocumentProviderManager(): DocumentProviderManager<RegisteredDocumentContentProvider> {
  const registeredScheme = "registered";
  return new DocumentProviderManager(
    registeredScheme,
    new RegisteredDocumentContentProvider(registeredScheme)
  );
}
