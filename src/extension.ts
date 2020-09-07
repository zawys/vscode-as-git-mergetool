import "regenerator-runtime";
import * as vscode from "vscode";
import { ArbitraryFilesMerger } from "./arbitraryFilesMerger";
import { DiffLayouterManager } from "./diffLayouterManager";
import { defaultExtensionContextManager } from "./extensionContextManager";
import { GitMergetoolReplacement } from "./gitMergetoolReplacement";
import { Lazy } from "./lazy";
import * as mergetool from "./mergetoolUI";
import { ReadonlyDocumentProviderManager } from "./readonlyDocumentProvider";
import { SettingsAssistantCreator } from "./settingsAssistant";
import { TemporarySettingsManager } from "./temporarySettingsManager";
import { VSCodeConfigurator } from "./vSCodeConfigurator";
import { ZoomManager } from "./zoom";

let extensionAPI: ExtensionAPI | undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<ExtensionAPI> {
  defaultExtensionContextManager.value = context;
  extensionAPI = new ExtensionAPI();
  await extensionAPI.activate();
  return extensionAPI;
}

// this method is called when your extension is deactivated
export function deactivate(): void {
  extensionAPI?.deactivate();
  extensionAPI = undefined;
}

export class ExtensionAPI {
  public async activate(): Promise<void> {
    // inverse order as below
    this.readonlyDocumentProviderManager.register();
    this.temporarySettingsManager.register();
    this.zoomManager.register();
    await this.diffLayouterManager.register();
    this.mergetoolUI.register();
    this.arbitraryFilesMerger.register();
    setTimeout(
      () => void this.settingsAssistantCreatorFactory().tryLaunch(),
      4000
    );
  }

  public deactivate(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    // inverse order as above
    this.arbitraryFilesMerger.dispose();
    this.mergetoolUI.dispose();
    this.diffLayouterManager.dispose();
    this.zoomManager.dispose();
    this.temporarySettingsManager.dispose();
    this.readonlyDocumentProviderManager.dispose();
  }

  public constructor(
    vSCodeConfigurator?: VSCodeConfigurator,
    readonlyDocumentProviderManager?: ReadonlyDocumentProviderManager,
    zoomManager?: ZoomManager,
    temporarySettingsManager?: TemporarySettingsManager,
    gitMergetoolReplacement?: GitMergetoolReplacement,
    diffLayouterManager?: DiffLayouterManager,
    mergetoolUI?: mergetool.MergetoolUI,
    arbitraryFilesMerger?: ArbitraryFilesMerger,
    settingsAssistantCreatorFactory?: () => SettingsAssistantCreator
  ) {
    const vSCodeConfiguratorProvider = new Lazy(
      () => vSCodeConfigurator || new VSCodeConfigurator()
    );
    this.readonlyDocumentProviderManager =
      readonlyDocumentProviderManager !== undefined
        ? readonlyDocumentProviderManager
        : new ReadonlyDocumentProviderManager();
    this.zoomManager =
      zoomManager !== undefined ? zoomManager : new ZoomManager();
    this.temporarySettingsManager =
      temporarySettingsManager !== undefined
        ? temporarySettingsManager
        : new TemporarySettingsManager(vSCodeConfiguratorProvider.value);
    this.gitMergetoolReplacement =
      gitMergetoolReplacement !== undefined
        ? gitMergetoolReplacement
        : new GitMergetoolReplacement();
    this.diffLayouterManager =
      diffLayouterManager !== undefined
        ? diffLayouterManager
        : new DiffLayouterManager(
            vSCodeConfiguratorProvider.value,
            this.zoomManager,
            this.temporarySettingsManager,
            this.gitMergetoolReplacement
          );
    this.mergetoolUI =
      mergetoolUI !== undefined
        ? mergetoolUI
        : new mergetool.MergetoolUI(
            this.diffLayouterManager,
            vSCodeConfiguratorProvider.value
          );
    this.arbitraryFilesMerger =
      arbitraryFilesMerger !== undefined
        ? arbitraryFilesMerger
        : new ArbitraryFilesMerger(this.diffLayouterManager);
    this.settingsAssistantCreatorFactory =
      settingsAssistantCreatorFactory !== undefined
        ? settingsAssistantCreatorFactory
        : () => new SettingsAssistantCreator(vSCodeConfiguratorProvider.value);
  }

  public readonly temporarySettingsManager: TemporarySettingsManager;
  public readonly zoomManager: ZoomManager;
  public readonly gitMergetoolReplacement: GitMergetoolReplacement;
  public readonly diffLayouterManager: DiffLayouterManager;
  public readonly mergetoolUI: mergetool.MergetoolUI;
  public readonly arbitraryFilesMerger: ArbitraryFilesMerger;
  public readonly settingsAssistantCreatorFactory: () => SettingsAssistantCreator;
  public readonly readonlyDocumentProviderManager: ReadonlyDocumentProviderManager;
  private timer: NodeJS.Timeout | undefined = undefined;
}
