import * as vscode from 'vscode';
import { VSCodeConfigurator, defaultVSCodeConfigurator } from './vSCodeConfigurator';
import { getWorkingDirectoryUri, getGitPath } from "./getPaths";
import * as cp from 'child_process';

export const settingsAssistantOnStartupID =
  "vscode-as-git-mergetool.settingsAssistantOnStartup";

export class SettingsAssistant {
  public async launch(): Promise<void> {
    let someNeedsChange: boolean = false;
    for (const assistant of this.optionsAssistants) {
      if (await assistant.needsChange()) {
        someNeedsChange = true;
        break;
      }
    }
    if (!someNeedsChange) {
      return;
    }
    while (true) {
      const nowItem = { title: "Now" };
      const newerItem = { title: "Never" };
      const postponeItem = { title: "Postpone to next startup" };
      const result = await vscode.window.showInformationMessage(
        "Some current settings will not work well with VS Code as 3-way merge tool. When do want to change them using dialogs?",
        nowItem, newerItem, postponeItem
      );
      if (result === newerItem) {
        await this.vSCodeConfigurator.set(settingsAssistantOnStartupID, false);
        return;
      }
      if (result !== nowItem) {
        return;
      }
      let restart = false;
      let abort = false;
      for (const assistant of this.optionsAssistants) {
        if (!await assistant.needsChange()) {
          continue;
        }
        const items = await assistant.provideQuickPickItems();
        items.push(this.skipOptionItem, this.abortItem, this.restartItem);
        const pickedItem = await this.showQuickPick(items);
        if (pickedItem === undefined || pickedItem === this.abortItem) {
          abort = true;
          break;
        } else if (pickedItem === this.skipOptionItem) {
        } else if (pickedItem === this.restartItem) {
          restart = true;
          break;
        } else {
          await assistant.handlePickedItem(pickedItem);
        }
      }
      if (abort) { break; }
      if (restart) { continue; }
      const pickedItem = await this.showQuickPick(
        [this.completeItem, this.restartItem]
      );
      if (pickedItem !== this.restartItem) {
        await this.vSCodeConfigurator.set(settingsAssistantOnStartupID, false);
        break;
      }
    }
  }

  constructor(
    private readonly gitConfigurator: GitConfigurator,
    private readonly vSCodeConfigurator: VSCodeConfigurator,
  ) { }

  private readonly optionsAssistants = [
    new GitOptionAssistant(
      this.gitConfigurator,
      "mergetool.keepTemporaries",
      "false",
      "Remove temporary files after the merge.",
    ),
    new GitOptionAssistant(
      this.gitConfigurator,
      "mergetool.keepBackup",
      "false",
      "Remove the automatically created backup files after a merge.",
    ),
    new GitOptionAssistant(
      this.gitConfigurator,
      "mergetool.code.cmd",
      'code "$BASE"',
      "Make VS Code available as merge tool.",
    ),
    new GitOptionAssistant(
      this.gitConfigurator,
      "merge.tool",
      "code",
      "Set VS Code as merge tool",
    ),
    new GitOptionAssistant(
      this.gitConfigurator,
      "merge.conflictstyle",
      "merge",
      "Do not output base hunk in merge conflict files.",
    ),
    new VSCodeOptionAssistant<boolean>(
      this.vSCodeConfigurator,
      "workbench.editor.closeEmptyGroups",
      true,
      "Do not keep open empty editor groups when stopping a diff layout.",
    ),
    new VSCodeOptionAssistant<boolean>(
      this.vSCodeConfigurator,
      "merge-conflict.codeLens.enabled",
      true,
      "Show action links for selecting changes directly above merge conflict sections."
    ),
    new VSCodeOptionAssistant<boolean>(
      this.vSCodeConfigurator,
      "diffEditor.codeLens",
      true,
      "Show the merge conflict code lens in diff editors.",
    )
  ];
  private readonly skipOptionItem: ExtendedQuickPickItem = {
    label: "Keep option unchanged",
  };
  private readonly abortItem: ExtendedQuickPickItem = {
    label: "Abort the assistant",
  };
  private readonly completeItem: ExtendedQuickPickItem = {
    label: "Complete the assistant",
  };
  private readonly restartItem: ExtendedQuickPickItem = {
    label: "Restart the assistant",
  };
  private showQuickPick(
    items: ExtendedQuickPickItem[]
  ): Thenable<ExtendedQuickPickItem | undefined> {
    return vscode.window.showQuickPick(
      items,
      {
        ignoreFocusOut: true,
        placeHolder: "Select an action"
      }
    );
  }
}

interface OptionAssistant {
  needsChange(): Promise<boolean>;
  provideQuickPickItems(): Promise<ExtendedQuickPickItem[]>;
  handlePickedItem(item: ExtendedQuickPickItem): Promise<void>;
}

interface ExtendedQuickPickItem extends vscode.QuickPickItem {
  value?: unknown
}

class GitOptionAssistant implements OptionAssistant {
  constructor(
    private readonly gitConfigurator: GitConfigurator,
    private readonly key: string,
    private readonly targetValue: string,
    private readonly description: string,
  ) { }
  async needsChange(): Promise<boolean> {
    return (await this.gitConfigurator.get(this.key)) !==
      this.targetValue;
  }

  async provideQuickPickItems(): Promise<ExtendedQuickPickItem[]> {
    const currentValue = await this.gitConfigurator.get(this.key);
    const detail = `${this.description}\nCurrent value: ${currentValue}`;
    return [
      {
        label: `Set git option \`${this.key}\` to \`${this.targetValue}\` globally.`,
        detail,
        value: GitOptionAssistant.globalValue,
      },
      {
        label: `Set git option \`${this.key}\` to \`${this.targetValue}\` in repository.`,
        detail,
        value: GitOptionAssistant.repositoryValue
      },
    ];
  }
  async handlePickedItem(item: ExtendedQuickPickItem): Promise<void> {
    let global: boolean;
    if (item.value === GitOptionAssistant.repositoryValue) {
      global = false;
    } else if (item.value === GitOptionAssistant.globalValue) {
      global = true;
    } else {
      return;
    }
    await this.gitConfigurator.set(
      this.key, this.targetValue, global
    );
  }

  private static readonly repositoryValue = "in repository";
  private static readonly globalValue = "globally";
}

export class GitConfigurator {
  public get(key: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      cp.execFile(this.gitPath, ["config", "--get", key], (err, stdout) => {
        if (err) {
          resolve(undefined);
        } else if (stdout.endsWith("\n")) {
          resolve(stdout.substr(0, stdout.length - 1));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  public set(
    key: string, value: string, global: boolean = true
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (key.startsWith("-")) {
        reject("invalid argument");
      }
      let args: string[];
      if (global) {
        args = ["config", "--global", key, value];
      } else {
        args = ["config", key, value];
      }
      cp.execFile(
        this.gitPath, args,
        { cwd: this.workingDirectory.fsPath },
        (err, stdout, stderr) => {
          if (err) {
            reject(
              `Setting git config ${key} failed with: ` +
              `${err}\n${stdout}\n${stderr}`
            );
          } else {
            resolve();
          }
        }
      );
    });
  }

  constructor(
    private readonly gitPath: string,
    private readonly workingDirectory: vscode.Uri,
  ) { }
}

class VSCodeOptionAssistant<T> implements OptionAssistant {
  constructor(
    private readonly configurator: VSCodeConfigurator,
    private readonly section: string,
    private readonly targetValue: T,
    private readonly description: string,
  ) { }

  async needsChange(): Promise<boolean> {
    return this.configurator.get<T>(this.section) !== this.targetValue;
  }
  async provideQuickPickItems(): Promise<ExtendedQuickPickItem[]> {
    const currentValue = this.configurator.get(this.section);
    const detail = `${this.description}\nCurrent value: ${currentValue}`;
    return [
      {
        label: `Set VS Code option \`${this.section}\` to \`${this.targetValue}\` globally.`,
        detail,
        value: VSCodeOptionAssistant.globalValue,
      },
      {
        label: `Set VS Code option \`${this.section}\` to \`${this.targetValue}\` in workspace.`,
        detail,
        value: VSCodeOptionAssistant.workspaceValue,
      }
    ];
  }
  async handlePickedItem(item: ExtendedQuickPickItem): Promise<void> {
    let global: boolean;
    if (item.value === VSCodeOptionAssistant.globalValue) {
      global = true;
    } else if (item.value === VSCodeOptionAssistant.workspaceValue) {
      global = false;
    } else {
      return;
    }
    await this.configurator.set(this.section, this.targetValue, global);
  }

  private static readonly globalValue = "globally";
  private static readonly workspaceValue = "in workspace";
}

export class SettingsAssistantCreator {
  public async tryLaunch(): Promise<void> {
    if (!this.vSCodeConfigurator.get(settingsAssistantOnStartupID)) {
      return;
    }
    const gitPath = await getGitPath();
    const workingDirectory = getWorkingDirectoryUri();
    if (gitPath === undefined || workingDirectory === undefined) {
      return;
    }
    const process = new SettingsAssistant(
      new GitConfigurator(gitPath, workingDirectory),
      this.vSCodeConfigurator,
    );
    try {
      await process.launch();
    } catch (error) {
      vscode.window.showErrorMessage(
        "Error on running the settings assistant: " + error
      );
    }
  }

  constructor(
    private readonly vSCodeConfigurator = defaultVSCodeConfigurator,
  ) { }
}
