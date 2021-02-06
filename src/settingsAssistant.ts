import * as cp from "child_process";
import * as vscode from "vscode";
import { extensionID } from "./ids";
import {
  getVSCGitPathInteractively,
  getWorkingDirectoryUri,
} from "./getPathsWithinVSCode";
import { VSCodeConfigurator } from "./vSCodeConfigurator";
import { formatExecFileError } from "./childProcessHandy";

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
      const result = await vscode.window.showInformationMessage(
        "Some current settings will not work well with VS Code as 3-way merge tool. When do want to change them using dialogs?",
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
    return vscode.window.showInformationMessage(
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

class GitOptionAssistant implements OptionAssistant {
  constructor(
    private readonly gitConfigurator: GitConfigurator,
    private readonly key: string,
    private readonly targetValue: string,
    private readonly description: string
  ) {}
  async needsChange(): Promise<boolean> {
    return (await this.gitConfigurator.get(this.key)) !== this.targetValue;
  }

  async provideQuestionData(): Promise<QuestionData> {
    const currentValue = await this.gitConfigurator.get(this.key);
    return {
      question:
        `Change Git option \`${this.key}\`. \n` +
        `Reason: ${this.description}. \n` +
        "Current value" +
        (currentValue === undefined ? " unset" : `: \`${currentValue}\``) +
        `. \nNew value: ${this.targetValue}.`,
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
    await this.gitConfigurator.set(this.key, this.targetValue, global);
  }

  private static readonly repositoryValue = "in repository";
  private static readonly globalValue = "globally";
}

export class GitConfigurator {
  public get(key: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      cp.execFile(
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
      cp.execFile(
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
    private readonly workingDirectory: vscode.Uri
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
      void vscode.window.showErrorMessage(
        `Error on running the settings assistant: ${JSON.stringify(error)}`
      );
    }
  }

  constructor(private readonly vSCodeConfigurator: VSCodeConfigurator) {}
}

class Option implements vscode.MessageItem {
  constructor(
    public readonly title: string,
    public readonly value?: unknown
  ) {}
}

interface QuestionData {
  question: string;
  options: Option[];
}
