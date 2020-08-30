import * as vscode from "vscode";
import * as mergetool from "./mergetoolUI";
import { SettingsAssistantCreator } from "./settingsAssistant";
import { DiffLayouterManager } from "./diffLayouterManager";
import { defaultExtensionContextManager } from "./extensionContextManager";
import { ArbitraryFilesMerger } from "./arbitraryFilesMerger";

let extension: Extension | undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  defaultExtensionContextManager.value = context;
  extension = new Extension();
  await extension.activate();
}

// this method is called when your extension is deactivated
export async function deactivate(): Promise<void> {
  await extension?.deactivate();
  extension = undefined;
}

export class Extension {
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
    private readonly diffLayouterManager = new DiffLayouterManager(),
    private readonly mergetoolUI = new mergetool.MergetoolUI(
      diffLayouterManager
    ),
    private readonly arbitraryFilesMerger = new ArbitraryFilesMerger(
      diffLayouterManager
    )
  ) {}

  private timer: NodeJS.Timeout | undefined = undefined;
}
