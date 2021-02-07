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
import { CommonMergeCommandsManager } from "./commonMergeCommandsManager";
import { ManualMergeProcess } from "./manualMergeProcess";

let extensionAPI: ExtensionAPI | undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionAPI> {
  defaultExtensionContextManager.value = context;
  extensionAPI = new ExtensionAPI(
    ...new ExtensionServicesCreator().createServices()
  );
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
    for (let index = this.registrationOrder.length - 1; index >= 0; index--) {
      const service = this.registrationOrder[index];
      service.dispose();
    }
  }

  public constructor(
    public readonly services: Readonly<ExtensionServices>,
    public readonly registrationOrder: Readonly<RegisterableService[]>
  ) {}
}

class ExtensionServicesCreator {
  public createServices(
    services: Readonly<Partial<ExtensionServices>> = {}
  ): [ExtensionServices, RegisterableService[]] {
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

    const commonMergeCommandsManager = new CommonMergeCommandsManager();
    registrationOrder.push(commonMergeCommandsManager);

    const manualMergeProcess = new ManualMergeProcess(diffLayouterManager);

    const gitMergetoolReplacement =
      services.gitMergetoolReplacement ||
      new GitMergetoolReplacement(
        registeredDocumentProvider,
        readonlyDocumentProvider,
        commonMergeCommandsManager,
        manualMergeProcess,
        diffLayouterManager
      );
    registrationOrder.push(gitMergetoolReplacement);

    const temporaryFileOpenManager =
      services.temporaryFileOpenManager ||
      new TemporaryFileOpenManager(
        diffLayouterManager,
        readonlyDocumentProvider
      );

    const editorOpenManager =
      services.editorOpenManager ||
      new EditorOpenManager([
        {
          handler: gitMergetoolReplacement,
          name: "gitMergetoolReplacement",
        },
        {
          handler: temporaryFileOpenManager,
          name: "temporaryFileOpenManager",
        },
      ]);
    registrationOrder.push(editorOpenManager);

    const arbitraryFilesMerger =
      services.arbitraryFilesMerger ||
      new ArbitraryFilesMerger(diffLayouterManager, readonlyDocumentProvider);
    registrationOrder.push(arbitraryFilesMerger);

    const settingsAssistantCreator =
      services.settingsAssistantCreator ||
      new SettingsAssistantCreator(vSCodeConfigurator);
    registrationOrder.push(settingsAssistantCreator);

    return [
      {
        arbitraryFilesMerger,
        diffLayouterManager,
        gitMergetoolReplacement,
        readonlyDocumentProviderManager,
        registeredDocumentProviderManager,
        settingsAssistantCreator,
        temporarySettingsManager,
        vSCodeConfigurator,
        zoomManager,
        temporaryFileOpenManager,
        editorOpenManager,
        commonMergeCommandsManager,
        manualMergeProcess,
      },
      registrationOrder,
    ];
  }
}

export interface ExtensionServices {
  vSCodeConfigurator: VSCodeConfigurator;
  readonlyDocumentProviderManager: DocumentProviderManager<ReadonlyDocumentProvider>;
  registeredDocumentProviderManager: DocumentProviderManager<RegisteredDocumentContentProvider>;
  zoomManager: ZoomManager;
  temporarySettingsManager: TemporarySettingsManager;
  gitMergetoolReplacement: GitMergetoolReplacement;
  diffLayouterManager: DiffLayouterManager;
  arbitraryFilesMerger: ArbitraryFilesMerger;
  settingsAssistantCreator: SettingsAssistantCreator;
  temporaryFileOpenManager: TemporaryFileOpenManager;
  editorOpenManager: EditorOpenManager;
  commonMergeCommandsManager: CommonMergeCommandsManager;
  manualMergeProcess: ManualMergeProcess;
}
