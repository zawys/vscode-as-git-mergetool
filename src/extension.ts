import "regenerator-runtime";
import * as vscode from "vscode";
import * as mergetool from "./mergetoolUI";
import { SettingsAssistantCreator } from "./settingsAssistant";
import { DiffLayouterManager } from "./diffLayouterManager";
import { defaultExtensionContextManager } from "./extensionContextManager";
import { ArbitraryFilesMerger } from "./arbitraryFilesMerger";
import { VSCodeConfigurator } from "./vSCodeConfigurator";
import { TemporarySettingsManager } from "./temporarySettingsManager";
import { Lazy } from "./lazy";
import { ZoomListener } from "./zoom";

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
    this.zoomListener.register();
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
    this.zoomListener.dispose();
    this.temporarySettingsManager.dispose();
  }

  public constructor(
    vSCodeConfigurator?: VSCodeConfigurator,
    zoomListener?: ZoomListener,
    temporarySettingsManager?: TemporarySettingsManager,
    diffLayouterManager?: DiffLayouterManager,
    mergetoolUI?: mergetool.MergetoolUI,
    arbitraryFilesMerger?: ArbitraryFilesMerger,
    settingsAssistantCreatorFactory?: () => SettingsAssistantCreator
  ) {
    const vSCodeConfiguratorProvider = new Lazy(
      () => vSCodeConfigurator || new VSCodeConfigurator()
    );
    if (zoomListener === undefined) {
      this.zoomListener = new ZoomListener();
    } else {
      this.zoomListener = zoomListener;
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
        this.zoomListener,
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
  public readonly zoomListener: ZoomListener;
  public readonly diffLayouterManager: DiffLayouterManager;
  public readonly mergetoolUI: mergetool.MergetoolUI;
  public readonly arbitraryFilesMerger: ArbitraryFilesMerger;
  public readonly settingsAssistantCreatorFactory: () => SettingsAssistantCreator;
  private timer: NodeJS.Timeout | undefined = undefined;
}
