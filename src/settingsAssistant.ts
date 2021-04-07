import { execFile } from "child_process";
import { createWriteStream } from "fs";
import { EOL, homedir } from "os";
import pDefer from "p-defer";
import path from "path";
import { Writable } from "stream";
import { MessageItem, Uri, window } from "vscode";
import { formatExecFileError } from "./childProcessHandy";
import {
  getVSCGitPathInteractively,
  getWorkspaceDirectoryUri,
} from "./getPathsWithinVSCode";
import { extensionID } from "./ids";
import { VSCodeConfigurator } from "./vSCodeConfigurator";

export const settingsAssistantOnStartupID = `${extensionID}.settingsAssistantOnStartup`;

export class SettingsAssistant {
  public async launch(): Promise<void> {
    let someNeedsChange = false;
    for (const assistant of this.optionsAssistants) {
      if (await assistant.getNeedsChange()) {
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
        if (!(await assistant.getNeedsChange())) {
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
    private readonly vSCodeConfigurator: VSCodeConfigurator,
    private changeProtocol: OptionChangeProtocol
  ) {
    const createGitOptionAssistant = (
      key: string,
      targetValue: string,
      description: string
    ) =>
      new GitOptionAssistant(
        gitConfigurator,
        key,
        targetValue,
        description,
        changeProtocol
      );
    const createVSCodeOptionAssistant = <T>(
      section: string,
      targetValue: T,
      description: string
    ) =>
      new VSCodeOptionAssistant<T>(
        vSCodeConfigurator,
        section,
        targetValue,
        description,
        changeProtocol
      );
    this.optionsAssistants = [
      createGitOptionAssistant(
        "mergetool.keepTemporaries",
        "false",
        "Remove temporary files after the merge."
      ),
      createGitOptionAssistant(
        "mergetool.keepBackup",
        "false",
        "Remove the automatically created backup files after a merge."
      ),
      createGitOptionAssistant(
        "mergetool.code.cmd",
        `"${process.execPath}" "$BASE"`,
        "Make VS Code available as merge tool."
      ),
      createGitOptionAssistant(
        "merge.tool",
        "code",
        "Set VS Code as merge tool."
      ),
      createGitOptionAssistant(
        "merge.conflictstyle",
        "merge",
        "Do not output base hunk in merge conflict files."
      ),
      createVSCodeOptionAssistant(
        "workbench.editor.closeEmptyGroups",
        true,
        "Do not keep open empty editor groups when stopping a diff layout."
      ),
      createVSCodeOptionAssistant(
        "merge-conflict.codeLens.enabled",
        true,
        "Show action links for selecting changes directly above merge conflict sections."
      ),
      createVSCodeOptionAssistant(
        "diffEditor.codeLens",
        true,
        "Show the merge conflict code lens in diff editors."
      ),
    ];
  }

  private readonly optionsAssistants: OptionAssistant[];
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
  getNeedsChange(): Promise<boolean>;
  provideQuestionData(): Promise<QuestionData>;
  handlePickedOption(item: Option): Promise<void>;
}

export class GitOptionAssistant implements OptionAssistant {
  constructor(
    private readonly configurator: GitConfigurator,
    private readonly key: string,
    private readonly targetValue: string,
    private readonly description: string,
    private readonly changeProtocol: OptionChangeProtocol
  ) {}
  async getNeedsChange(): Promise<boolean> {
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
    const oldValue = await this.configurator.get(this.key);
    await this.configurator.set(this.key, this.targetValue, global);
    this.changeProtocol.log({
      type: `Git option (${
        global
          ? "global"
          : `in repository ${this.configurator.workspaceDirectoryUri.fsPath}`
      })`,
      key: this.key,
      oldValue: oldValue === undefined ? "(unset)" : oldValue,
      newValue: this.targetValue,
      reason: this.description,
    });
  }

  private static readonly repositoryValue = "in repository";
  private static readonly globalValue = "globally";
}

export class GitConfigurator {
  public get(key: string, global = false): Promise<string | undefined> {
    return new Promise((resolve) => {
      execFile(
        this.gitPath,
        ["config", "--get", key],
        {
          windowsHide: true,
          timeout: 5000,
          cwd: global ? homedir() : this.workspaceDirectoryUri.fsPath,
        },
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
        {
          cwd: this.workspaceDirectoryUri.fsPath,
          timeout: 5000,
        },
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
    public readonly workspaceDirectoryUri: Uri
  ) {}
}

class VSCodeOptionAssistant<T> implements OptionAssistant {
  constructor(
    private readonly configurator: VSCodeConfigurator,
    private readonly section: string,
    private readonly targetValue: T,
    private readonly description: string,
    private readonly changeProtocol: OptionChangeProtocol
  ) {}

  getNeedsChange(): Promise<boolean> {
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
    const oldValue = await this.configurator.get(this.section);
    await this.configurator.set(this.section, this.targetValue, global);
    const workspaceDirectory = getWorkspaceDirectoryUri();
    this.changeProtocol.log({
      type: `VSCode option (${
        global
          ? "global"
          : `in workspace ${workspaceDirectory?.fsPath ?? "undefined"}`
      })`,
      key: this.section,
      oldValue: oldValue === undefined ? "(unset)" : oldValue,
      newValue: this.targetValue,
      reason: this.description,
    });
  }

  private static readonly globalValue = "globally";
  private static readonly workspaceValue = "in workspace";
}

export class SettingsAssistantProcess {
  public async tryLaunch(): Promise<void> {
    if (!this.vSCodeConfigurator.get(settingsAssistantOnStartupID)) {
      return;
    }
    const gitPath = await getVSCGitPathInteractively();
    const workspaceDirectoryUri = getWorkspaceDirectoryUri();
    if (gitPath === undefined || workspaceDirectoryUri === undefined) {
      return;
    }
    const optionChangeProtocol = new OptionChangeProtocol();
    const process = new SettingsAssistant(
      new GitConfigurator(gitPath, workspaceDirectoryUri),
      this.vSCodeConfigurator,
      optionChangeProtocol
    );
    try {
      await process.launch();
    } catch (error) {
      void window.showErrorMessage(
        `Error on running the settings assistant: ${JSON.stringify(error)}`
      );
    }
    if (optionChangeProtocol.entries.length > 0) {
      await this.writeOptionChangeProtocol(optionChangeProtocol);
    }
  }

  private async writeOptionChangeProtocol(
    optionChangeProtocol: OptionChangeProtocol
  ): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const destinationUri = await window.showSaveDialog({
          defaultUri: Uri.file(
            path.join(
              homedir(),
              "vscode-as-git-mergetool_option_change_protocol.yml"
            )
          ),
          // eslint-disable-next-line @typescript-eslint/naming-convention
          filters: { YAML: ["yml", "yaml"] },
          title: "Save option change protocol (last chance)",
        });
        if (destinationUri === undefined) {
          return;
        }
        const destinationPath = destinationUri.fsPath;
        let writeStream: Writable | undefined = undefined;
        try {
          writeStream = createWriteStream(destinationPath, { flags: "a" });
          await this.optionChangeProtocolExporter.export(
            writeStream,
            optionChangeProtocol
          );
        } finally {
          await new Promise((resolve) => writeStream?.end(resolve));
        }
        break;
      } catch (error: unknown) {
        const retryItem: MessageItem = { title: "Retry" };
        const cancelItem: MessageItem = { title: "Cancel" };
        const selectedItem = await window.showErrorMessage(
          `Saving option change protocol failed: \n${String(error)}`,
          retryItem,
          cancelItem
        );
        if (selectedItem !== retryItem) {
          break;
        }
      }
    }
  }

  constructor(
    private readonly vSCodeConfigurator: VSCodeConfigurator,
    private readonly optionChangeProtocolExporter: OptionChangeProtocolExporter
  ) {}
}

export interface OptionChangeProtocolEntry {
  type: string;
  key: string;
  oldValue: Exclude<unknown, undefined>;
  newValue: Exclude<unknown, undefined>;
  reason: string;
}

export class OptionChangeProtocol {
  public log(entry: OptionChangeProtocolEntry): void {
    this.entries.push(entry);
  }

  public constructor(public entries: OptionChangeProtocolEntry[] = []) {}
}

export class OptionChangeProtocolExporter {
  public async export(
    destination: Writable,
    protocol: OptionChangeProtocol
  ): Promise<void> {
    const writeLine = (text: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        destination.write(`${text}${EOL}`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    };
    const task = async () => {
      await writeLine("---");
      for (const entry of protocol.entries) {
        const data: [string, Exclude<unknown, undefined>][] = [
          ["- type: ", entry.type],
          ["  key: ", entry.key],
          ["  newValue: ", entry.newValue],
          ["  oldValue: ", entry.oldValue],
          ["  reason: ", entry.reason],
        ];
        for (const [prefix, value] of data) {
          await writeLine(`${prefix}${JSON.stringify(value)}`);
        }
      }
    };
    const errorEventDeferred = pDefer();
    const rejectListener = errorEventDeferred.reject.bind(errorEventDeferred);
    destination.addListener("error", rejectListener);
    try {
      await Promise.race([task(), errorEventDeferred.promise]);
    } finally {
      destination.removeListener("error", rejectListener);
    }
  }
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
