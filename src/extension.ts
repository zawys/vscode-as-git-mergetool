import "regenerator-runtime";
import { ExtensionContext } from "vscode";
import { ArbitraryFilesMerger } from "./arbitraryFilesMerger";
import { DiffLayouterManager } from "./diffLayouterManager";
import { GitMergetoolReplacement } from "./gitMergetoolReplacement";
import { Lazy } from "./lazy";
import { MergetoolUI } from "./mergetoolUI";
import { ReadonlyDocumentProviderManager } from "./readonlyDocumentProvider";
import {
  OptionChangeProtocolExporter,
  SettingsAssistantLauncher,
} from "./settingsAssistant";
import { TemporarySettingsManager } from "./temporarySettingsManager";
import { VSCodeConfigurator } from "./vSCodeConfigurator";
import { ZoomManager } from "./zoom";

let extensionAPI: ExtensionAPI | undefined;

export async function activate(
  context: ExtensionContext
): Promise<ExtensionAPI> {
  extensionAPI = new ExtensionAPI(context);
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
    this.settingsAssistantLauncher.register();
    setTimeout(
      () => void this.settingsAssistantLauncher.tryLaunchOnStartup(),
      4000
    );
  }

  public deactivate(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    // inverse order as above
    this.settingsAssistantLauncher.dispose();
    this.arbitraryFilesMerger.dispose();
    this.mergetoolUI.dispose();
    this.diffLayouterManager.dispose();
    this.zoomManager.dispose();
    this.temporarySettingsManager.dispose();
    this.readonlyDocumentProviderManager.dispose();
  }

  public constructor(
    public readonly context: ExtensionContext,
    vSCodeConfigurator?: VSCodeConfigurator,
    readonlyDocumentProviderManager?: ReadonlyDocumentProviderManager,
    zoomManager?: ZoomManager,
    temporarySettingsManager?: TemporarySettingsManager,
    gitMergetoolReplacement?: GitMergetoolReplacement,
    diffLayouterManager?: DiffLayouterManager,
    mergetoolUI?: MergetoolUI,
    arbitraryFilesMerger?: ArbitraryFilesMerger,
    optionChangeProtocolExporter?: OptionChangeProtocolExporter,
    settingsAssistantLauncher?: SettingsAssistantLauncher
  ) {
    const vSCodeConfiguratorProvider = new Lazy(
      () => vSCodeConfigurator || new VSCodeConfigurator()
    );
    this.readonlyDocumentProviderManager =
      readonlyDocumentProviderManager ?? new ReadonlyDocumentProviderManager();
    this.zoomManager = zoomManager ?? new ZoomManager();
    this.temporarySettingsManager =
      temporarySettingsManager ??
      new TemporarySettingsManager(
        vSCodeConfiguratorProvider.value,
        context.globalState
      );
    this.gitMergetoolReplacement =
      gitMergetoolReplacement ?? new GitMergetoolReplacement();
    this.diffLayouterManager =
      diffLayouterManager ??
      new DiffLayouterManager(
        vSCodeConfiguratorProvider.value,
        this.zoomManager,
        this.temporarySettingsManager,
        this.gitMergetoolReplacement
      );
    this.mergetoolUI =
      mergetoolUI ??
      new MergetoolUI(
        this.diffLayouterManager,
        vSCodeConfiguratorProvider.value
      );
    this.arbitraryFilesMerger =
      arbitraryFilesMerger ??
      new ArbitraryFilesMerger(
        this.diffLayouterManager,
        context.workspaceState
      );
    this.optionChangeProtocolExporter =
      optionChangeProtocolExporter ?? new OptionChangeProtocolExporter();
    this.settingsAssistantLauncher =
      settingsAssistantLauncher ??
      new SettingsAssistantLauncher(
        vSCodeConfiguratorProvider.value,
        this.optionChangeProtocolExporter
      );
  }

  public readonly temporarySettingsManager: TemporarySettingsManager;
  public readonly zoomManager: ZoomManager;
  public readonly gitMergetoolReplacement: GitMergetoolReplacement;
  public readonly diffLayouterManager: DiffLayouterManager;
  public readonly mergetoolUI: MergetoolUI;
  public readonly arbitraryFilesMerger: ArbitraryFilesMerger;
  public readonly optionChangeProtocolExporter: OptionChangeProtocolExporter;
  public readonly settingsAssistantLauncher: SettingsAssistantLauncher;
  public readonly readonlyDocumentProviderManager: ReadonlyDocumentProviderManager;
  private timer: NodeJS.Timeout | undefined = undefined;
}
