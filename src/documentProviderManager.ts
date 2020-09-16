// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { Disposable, TextDocumentContentProvider, workspace } from "vscode";
import { RegisterableService } from "./registerableService";

export class DocumentProviderManager<
  T extends TextDocumentContentProvider = TextDocumentContentProvider
> implements RegisterableService {
  public register(): void {
    this.dispose();
    this.registration = workspace.registerTextDocumentContentProvider(
      this.scheme,
      this.documentProvider
    );
  }
  public dispose(): void {
    this.registration?.dispose();
    this.registration = undefined;
  }

  public constructor(
    public readonly scheme: string,
    public readonly documentProvider: T
  ) {}

  private registration: Disposable | undefined;
}
