// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import "regenerator-runtime";
import * as vscode from "vscode";
import { ArbitraryFilesMerger } from "./arbitraryFilesMerger";
import { DiffLayouterManager } from "./diffLayouterManager";
import { DocumentProviderManager } from "./documentProviderManager";
import { EditorOpenManager } from "./editorOpenManager";
import {
  createRegisteredDocumentProviderManager,
  RegisteredDocumentContentProvider,
} from "./registeredDocumentContentProvider";
import { defaultExtensionContextManager } from "./extensionContextManager";
import { GitMergetoolReplacement } from "./gitMergetoolReplacement";
import * as mergetool from "./mergetoolUI";
import {
  createReadonlyDocumentProviderManager,
  ReadonlyDocumentProvider,
} from "./readonlyDocumentProvider";
import { RegisterableService } from "./registerableService";
import { SettingsAssistantCreator } from "./settingsAssistant";
import { TemporaryFileOpenManager } from "./temporaryFileOpenManager";
import { TemporarySettingsManager } from "./temporarySettingsManager";
import { VSCodeConfigurator } from "./vSCodeConfigurator";
import { ZoomManager } from "./zoom";
import { setGracefulCleanup } from "tmp";

let extensionAPI: ExtensionAPI | undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionAPI> {
  defaultExtensionContextManager.value = context;
  extensionAPI = new ExtensionAPI();
  await extensionAPI.register();
  return extensionAPI;
}

// this method is called when your extension is deactivated
export function deactivate(): void {
  extensionAPI?.dispose();
  extensionAPI = undefined;
}

export class ExtensionAPI implements RegisterableService {
  public async register(): Promise<void> {
    setGracefulCleanup();

    // inverse order as below
    for (const service of this.registrationOrder) {
      await service.register();
    }
  }

  public dispose(): void {
    // inverse order as above
    for (let i = this.registrationOrder.length - 1; i >= 0; i--) {
      const service = this.registrationOrder[i];
      service.dispose();
    }
  }

  public constructor(services?: Partial<ExtensionServices>) {
    services = services || {};
    const registrationOrder: RegisterableService[] = [];

    const vSCodeConfigurator =
      services?.vSCodeConfigurator || new VSCodeConfigurator();

    const readonlyDocumentProviderManager =
      services.readonlyDocumentProviderManager ||
      createReadonlyDocumentProviderManager();
    registrationOrder.push(readonlyDocumentProviderManager);
    const readonlyDocumentProvider =
      readonlyDocumentProviderManager.documentProvider;

    const registeredDocumentProviderManager =
      services.registeredDocumentProviderManager ||
      createRegisteredDocumentProviderManager();
    registrationOrder.push(registeredDocumentProviderManager);
    const registeredDocumentProvider =
      registeredDocumentProviderManager.documentProvider;

    const zoomManager = services.zoomManager || new ZoomManager();
    registrationOrder.push(zoomManager);

    const temporarySettingsManager =
      services.temporarySettingsManager ||
      new TemporarySettingsManager(vSCodeConfigurator);
    registrationOrder.push(temporarySettingsManager);

    const diffLayouterManager =
      services.diffLayouterManager ||
      new DiffLayouterManager(
        vSCodeConfigurator,
        zoomManager,
        temporarySettingsManager
      );
    registrationOrder.push(diffLayouterManager);

    const gitMergetoolReplacement =
      services.gitMergetoolReplacement ||
      new GitMergetoolReplacement(
        registeredDocumentProvider,
        readonlyDocumentProvider,
        diffLayouterManager
      );

    const temporaryFileOpenManager =
      services.temporaryFileOpenManager ||
      new TemporaryFileOpenManager(
        diffLayouterManager,
        readonlyDocumentProvider
      );

    const mergetoolUI =
      services.mergetoolUI ||
      new mergetool.MergetoolUI(diffLayouterManager, vSCodeConfigurator);
    registrationOrder.push(mergetoolUI);

    const editorOpenManager =
      services.editorOpenManager ||
      new EditorOpenManager(
        temporaryFileOpenManager,
        gitMergetoolReplacement,
        diffLayouterManager
      );
    registrationOrder.push(editorOpenManager);

    const arbitraryFilesMerger =
      services.arbitraryFilesMerger ||
      new ArbitraryFilesMerger(diffLayouterManager, readonlyDocumentProvider);
    registrationOrder.push(arbitraryFilesMerger);

    const settingsAssistantCreator =
      services.settingsAssistantCreator ||
      new SettingsAssistantCreator(vSCodeConfigurator);
    registrationOrder.push(settingsAssistantCreator);

    this.services = {
      arbitraryFilesMerger,
      diffLayouterManager,
      gitMergetoolReplacement,
      mergetoolUI,
      readonlyDocumentProviderManager,
      registeredDocumentProviderManager,
      settingsAssistantCreator,
      temporarySettingsManager,
      vSCodeConfigurator,
      zoomManager,
      temporaryFileOpenManager,
      editorOpenManager,
    };
    this.registrationOrder = registrationOrder;
  }

  public readonly services: Readonly<ExtensionServices>;
  public readonly registrationOrder: Readonly<RegisterableService[]>;
}

export interface ExtensionServices {
  vSCodeConfigurator: VSCodeConfigurator;
  readonlyDocumentProviderManager: DocumentProviderManager<
    ReadonlyDocumentProvider
  >;
  registeredDocumentProviderManager: DocumentProviderManager<
    RegisteredDocumentContentProvider
  >;
  zoomManager: ZoomManager;
  temporarySettingsManager: TemporarySettingsManager;
  gitMergetoolReplacement: GitMergetoolReplacement;
  diffLayouterManager: DiffLayouterManager;
  mergetoolUI: mergetool.MergetoolUI;
  arbitraryFilesMerger: ArbitraryFilesMerger;
  settingsAssistantCreator: SettingsAssistantCreator;
  temporaryFileOpenManager: TemporaryFileOpenManager;
  editorOpenManager: EditorOpenManager;
}
