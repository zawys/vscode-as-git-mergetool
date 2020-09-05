import "regenerator-runtime";
import * as vscode from "vscode";
import { ArbitraryFilesMerger } from "./arbitraryFilesMerger";
import { DiffLayouterManager } from "./diffLayouterManager";
import { defaultExtensionContextManager } from "./extensionContextManager";
import { Lazy } from "./lazy";
import * as mergetool from "./mergetoolUI";
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
  }

  public constructor(
    vSCodeConfigurator?: VSCodeConfigurator,
    zoomManager?: ZoomManager,
    temporarySettingsManager?: TemporarySettingsManager,
    diffLayouterManager?: DiffLayouterManager,
    mergetoolUI?: mergetool.MergetoolUI,
    arbitraryFilesMerger?: ArbitraryFilesMerger,
    settingsAssistantCreatorFactory?: () => SettingsAssistantCreator
  ) {
    const vSCodeConfiguratorProvider = new Lazy(
      () => vSCodeConfigurator || new VSCodeConfigurator()
    );
    if (zoomManager === undefined) {
      this.zoomManager = new ZoomManager();
    } else {
      this.zoomManager = zoomManager;
    }
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
        this.zoomManager,
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
  public readonly zoomManager: ZoomManager;
  public readonly diffLayouterManager: DiffLayouterManager;
  public readonly mergetoolUI: mergetool.MergetoolUI;
  public readonly arbitraryFilesMerger: ArbitraryFilesMerger;
  public readonly settingsAssistantCreatorFactory: () => SettingsAssistantCreator;
  private timer: NodeJS.Timeout | undefined = undefined;
}
