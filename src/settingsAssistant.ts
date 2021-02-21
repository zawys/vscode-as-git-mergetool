// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { execFile } from "child_process";
import { MessageItem, Uri, window } from "vscode";
import { formatExecFileError } from "./childProcessHandy";
import {
  getVSCGitPathInteractively,
  getWorkingDirectoryUri,
} from "./getPathsWithinVSCode";
import { extensionID } from "./ids";
import { RegisterableService } from "./registerableService";
import { VSCodeConfigurator } from "./vSCodeConfigurator";

export const settingsAssistantOnStartupID = `${extensionID}.settingsAssistantOnStartup`;

export class SettingsAssistant {
  public async launch(): Promise<void> {
    let someNeedsChange = false;
    for (const assistant of this.optionsAssistants) {
      if (await assistant.needsChange()) {
        someNeedsChange = true;
        break;
      }
    }
    if (!someNeedsChange) {
      return;
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const nowItem = { title: "Now" };
      const newerItem = { title: "Never" };
      const postponeItem = { title: "Postpone to next startup" };
      const result = await window.showInformationMessage(
        "Some current settings will not work well with VS Code as merge tool. When do want to change them using dialogs?",
        nowItem,
        newerItem,
        postponeItem
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
        if (!(await assistant.needsChange())) {
          continue;
        }
        const question = await assistant.provideQuestionData();
        question.options.push(
          this.skipOptionItem,
          this.abortItem,
          this.restartItem
        );
        const pickedOption = await this.ask(question);
        if (pickedOption === undefined || pickedOption === this.abortItem) {
          abort = true;
          break;
        } else if (pickedOption === this.skipOptionItem) {
          continue;
        } else if (pickedOption === this.restartItem) {
          restart = true;
          break;
        } else {
          await assistant.handlePickedOption(pickedOption);
        }
      }
      if (abort) {
        break;
      }
      if (restart) {
        continue;
      }
      const pickedItem = await this.ask({
        question: "Settings assistant finished.",
        options: [this.completeItem, this.restartItem],
      });
      if (pickedItem !== this.restartItem) {
        await this.vSCodeConfigurator.set(settingsAssistantOnStartupID, false);
        break;
      }
    }
  }

  constructor(
    private readonly gitConfigurator: GitConfigurator,
    private readonly vSCodeConfigurator: VSCodeConfigurator
  ) {}

  private readonly optionsAssistants = [
    new GitOptionAssistant(
      this.gitConfigurator,
      "mergetool.keepTemporaries",
      "false",
      "Remove temporary files after the merge."
    ),
    new GitOptionAssistant(
      this.gitConfigurator,
      "mergetool.keepBackup",
      "false",
      "Remove the automatically created backup files after a merge."
    ),
    new GitOptionAssistant(
      this.gitConfigurator,
      "mergetool.code.cmd",
      `"${process.execPath}" "$BASE"`,
      "Make VS Code available as merge tool."
    ),
    new GitOptionAssistant(
      this.gitConfigurator,
      "merge.tool",
      "code",
      "Set VS Code as merge tool"
    ),
    new GitOptionAssistant(
      this.gitConfigurator,
      "merge.conflictstyle",
      "merge",
      "Do not output base hunk in merge conflict files."
    ),
    new VSCodeOptionAssistant<boolean>(
      this.vSCodeConfigurator,
      "workbench.editor.closeEmptyGroups",
      true,
      "Do not keep open empty editor groups when stopping a diff layout."
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
      "Show the merge conflict code lens in diff editors."
    ),
  ];
  private readonly skipOptionItem = new Option("Skip");
  private readonly abortItem = new Option("Abort");
  private readonly completeItem = new Option("Complete");
  private readonly restartItem = new Option("Restart");

  private ask(question: QuestionData): Thenable<Option | undefined> {
    return window.showInformationMessage(
      question.question,
      ...question.options
    );
  }
}

interface OptionAssistant {
  needsChange(): Promise<boolean>;
  provideQuestionData(): Promise<QuestionData>;
  handlePickedOption(item: Option): Promise<void>;
}

function getBackupConfigKey(key: string): string {
  return `${key}__vscode_as_git_mergetool_backup`;
}

const unsetValue = `(${getBackupConfigKey("unset")})`;

class GitOptionAssistant implements OptionAssistant {
  constructor(
    private readonly configurator: GitConfigurator,
    private readonly key: string,
    private readonly targetValue: string,
    private readonly description: string
  ) {}
  async needsChange(): Promise<boolean> {
    return (await this.configurator.get(this.key)) !== this.targetValue;
  }

  async provideQuestionData(): Promise<QuestionData> {
    const currentValue = await this.configurator.get(this.key);
    return {
      question:
        `Change Git option \`${this.key}\`. \n` +
        `Reason: ${this.description}. \n` +
        "Current value" +
        (currentValue === undefined
          ? " unset. \n"
          : `: \`${currentValue}\`. \n`) +
        `New value: ${this.targetValue}.`,
      options: [
        new Option(`Globally`, GitOptionAssistant.globalValue),
        new Option(`In repository`, GitOptionAssistant.repositoryValue),
      ],
    };
  }
  async handlePickedOption(item: Option): Promise<void> {
    let global: boolean;
    if (item.value === GitOptionAssistant.repositoryValue) {
      global = false;
    } else if (item.value === GitOptionAssistant.globalValue) {
      global = true;
    } else {
      return;
    }
    const backupConfigKey = getBackupConfigKey(this.key);
    const previousValue = await this.configurator.get(this.key);
    await this.configurator.set(
      backupConfigKey,
      previousValue ?? unsetValue,
      global
    );
    await this.configurator.set(this.key, this.targetValue, global);
  }

  private static readonly repositoryValue = "in repository";
  private static readonly globalValue = "globally";
}

export class GitConfigurator {
  public get(key: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      execFile(
        this.gitPath,
        ["config", "--get", key],
        { windowsHide: true, timeout: 5000 },
        (error, stdout) => {
          if (error) {
            resolve(undefined);
          } else if (stdout.endsWith("\n")) {
            resolve(stdout.slice(0, Math.max(0, stdout.length - 1)));
          } else {
            resolve(stdout);
          }
        }
      );
    });
  }

  public set(key: string, value: string, global = true): Promise<void> {
    return new Promise((resolve, reject) => {
      if (key.startsWith("-")) {
        reject("invalid argument");
      }
      const arguments_ = global
        ? ["config", "--global", key, value]
        : ["config", key, value];
      execFile(
        this.gitPath,
        arguments_,
        { cwd: this.workingDirectory.fsPath },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              `Setting Git configuration ${key} failed with: ` +
                formatExecFileError({ error, stdout, stderr })
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
    private readonly workingDirectory: Uri
  ) {}
}

class VSCodeOptionAssistant<T> implements OptionAssistant {
  constructor(
    private readonly configurator: VSCodeConfigurator,
    private readonly section: string,
    private readonly targetValue: T,
    private readonly description: string
  ) {}

  needsChange(): Promise<boolean> {
    return Promise.resolve(
      this.configurator.get(this.section) !== this.targetValue
    );
  }
  provideQuestionData(): Promise<QuestionData> {
    const currentValue = this.configurator.get(this.section);
    return Promise.resolve({
      question:
        `Change VS Code option \`${this.section}\`. \n` +
        `Reason: ${this.description}. \n` +
        `Current value: \`${JSON.stringify(currentValue)}\`. \n` +
        `New value: ${JSON.stringify(this.targetValue)}.`,
      options: [
        new Option(`Globally`, VSCodeOptionAssistant.globalValue),
        new Option(`In workspace`, VSCodeOptionAssistant.workspaceValue),
      ],
    });
  }
  async handlePickedOption(item: Option): Promise<void> {
    let global: boolean;
    if (item.value === VSCodeOptionAssistant.globalValue) {
      global = true;
    } else if (item.value === VSCodeOptionAssistant.workspaceValue) {
      global = false;
    } else {
      return;
    }
    const backupConfigKey = getBackupConfigKey(this.section);
    const previousValue = await this.configurator.get(this.section);
    await this.configurator.set(
      backupConfigKey,
      previousValue ?? unsetValue,
      global
    );
    await this.configurator.set(this.section, this.targetValue, global);
  }

  private static readonly globalValue = "globally";
  private static readonly workspaceValue = "in workspace";
}

export class SettingsAssistantCreator implements RegisterableService {
  public register(): void {
    this.timer = setTimeout(() => void this.tryLaunch(), 4000);
  }

  public dispose(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
  }

  public async tryLaunch(): Promise<void> {
    if (!this.vSCodeConfigurator.get(settingsAssistantOnStartupID)) {
      return;
    }
    const gitPath = await getVSCGitPathInteractively();
    const workingDirectory = getWorkingDirectoryUri();
    if (gitPath === undefined || workingDirectory === undefined) {
      return;
    }
    const process = new SettingsAssistant(
      new GitConfigurator(gitPath, workingDirectory),
      this.vSCodeConfigurator
    );
    try {
      await process.launch();
    } catch (error) {
      void window.showErrorMessage(
        `Error on running the settings assistant: ${JSON.stringify(error)}`
      );
    }
  }

  public constructor(
    private readonly vSCodeConfigurator: VSCodeConfigurator
  ) {}

  private timer: NodeJS.Timeout | undefined = undefined;
}

class Option implements MessageItem {
  constructor(
    public readonly title: string,
    public readonly value?: unknown
  ) {}
}

interface QuestionData {
  question: string;
  options: Option[];
}
