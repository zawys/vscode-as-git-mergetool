import * as vscode from "vscode";
import * as mergetool from "./mergetoolUI";
import { SettingsAssistantCreator } from "./settingsAssistant";
import { DiffLayouterManager } from "./diffLayouterManager";
import { defaultExtensionContextManager } from "./extensionContextManager";
import { ArbitraryFilesMerger } from "./arbitraryFilesMerger";
import { VSCodeConfigurator } from "./vSCodeConfigurator";
import { TemporarySettingsManager } from "./temporarySettingsManager";
import { Lazy } from "./lazy";

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
    this.temporarySettingsManager.register();
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
    this.mergetoolUI.dispose();
    this.temporarySettingsManager.dispose();
    this.arbitraryFilesMerger.dispose();
    this.diffLayouterManager.dispose();
  }

  public constructor(
    vSCodeConfigurator?: VSCodeConfigurator,
    temporarySettingsManager?: TemporarySettingsManager,
    diffLayouterManager?: DiffLayouterManager,
    mergetoolUI?: mergetool.MergetoolUI,
    arbitraryFilesMerger?: ArbitraryFilesMerger,
    settingsAssistantCreatorFactory?: () => SettingsAssistantCreator
  ) {
    const vSCodeConfiguratorProvider = new Lazy(
      () => vSCodeConfigurator || new VSCodeConfigurator()
    );
    if (temporarySettingsManager === undefined) {
      this.temporarySettingsManager = new TemporarySettingsManager(
        vSCodeConfiguratorProvider.value
      );
    } else {
      this.temporarySettingsManager = temporarySettingsManager;
    }
    if (diffLayouterManager === undefined) {
      this.diffLayouterManager = new DiffLayouterManager(
        vSCodeConfiguratorProvider.value,
        this.temporarySettingsManager
      );
    } else {
      this.diffLayouterManager = diffLayouterManager;
    }
    if (mergetoolUI === undefined) {
      this.mergetoolUI = new mergetool.MergetoolUI(
        this.diffLayouterManager,
        vSCodeConfiguratorProvider.value
      );
    } else {
      this.mergetoolUI = mergetoolUI;
    }
    if (arbitraryFilesMerger === undefined) {
      this.arbitraryFilesMerger = new ArbitraryFilesMerger(
        this.diffLayouterManager
      );
    } else {
      this.arbitraryFilesMerger = arbitraryFilesMerger;
    }
    if (settingsAssistantCreatorFactory === undefined) {
      this.settingsAssistantCreatorFactory = () =>
        new SettingsAssistantCreator(vSCodeConfiguratorProvider.value);
    } else {
      this.settingsAssistantCreatorFactory = settingsAssistantCreatorFactory;
    }
  }

  public readonly temporarySettingsManager: TemporarySettingsManager;
  public readonly diffLayouterManager: DiffLayouterManager;
  public readonly mergetoolUI: mergetool.MergetoolUI;
  public readonly arbitraryFilesMerger: ArbitraryFilesMerger;
  public readonly settingsAssistantCreatorFactory: () => SettingsAssistantCreator;
  private timer: NodeJS.Timeout | undefined = undefined;
}
