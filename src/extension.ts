import * as vscode from "vscode";
import * as mergetool from "./mergetoolUI";
import { SettingsAssistantCreator } from "./settingsAssistant";
import { DiffLayouterManager } from "./diffLayouterManager";
import { defaultExtensionContextManager } from "./extensionContextManager";
import { ArbitraryFilesMerger } from "./arbitraryFilesMerger";

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
export async function deactivate(): Promise<void> {
  await extensionAPI?.deactivate();
  extensionAPI = undefined;
}

export class ExtensionAPI {
  public async activate(): Promise<void> {
    await this.diffLayouterManager.register();
    this.mergetoolUI.register();
    this.arbitraryFilesMerger.register();
    setTimeout(() => void new SettingsAssistantCreator().tryLaunch(), 4000);
  }

  public async deactivate(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.mergetoolUI.dispose();
    await this.diffLayouterManager.dispose();
  }

  public constructor(
    public readonly diffLayouterManager = new DiffLayouterManager(),
    public readonly mergetoolUI = new mergetool.MergetoolUI(
      diffLayouterManager
    ),
    public readonly arbitraryFilesMerger = new ArbitraryFilesMerger(
      diffLayouterManager
    )
  ) {}

  private timer: NodeJS.Timeout | undefined = undefined;
}
