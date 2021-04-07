import { execFile } from "child_process";
import { createWriteStream } from "fs";
import { EOL, homedir } from "os";
import pDefer from "p-defer";
import path from "path";
import { Writable } from "stream";
import { commands } from "vscode";
import { Disposable, MessageItem, Uri, window } from "vscode";
import { formatExecFileError } from "./childProcessHandy";
import {
  getVSCGitPathInteractively,
  getWorkspaceDirectoryUri,
} from "./getPathsWithinVSCode";
import { extensionID } from "./ids";
import { Monitor } from "./monitor";
import { VSCodeConfigurator } from "./vSCodeConfigurator";

export const settingsAssistantOnStartupSettingID = `${extensionID}.settingsAssistantOnStartup`;
export const runSettingsAssistantCommandID = `${extensionID}.runSettingsAssistant`;

export class SettingsAssistant {
  public async launch(): Promise<void> {
    const { error, apply, pickedOptions } = await this.gatherDecisions();
    if (error !== undefined) {
      void window.showErrorMessage(
        `Error while running the settings assistant. ` +
          `No changes were made. ${JSON.stringify(error)}`
      );
      return;
    }
    if (!apply) return;
    await this.applyDecisions(pickedOptions);
  }

  public constructor(
    private readonly gitConfigurator: GitConfigurator,
    private readonly vSCodeConfigurator: VSCodeConfigurator,
    private readonly optionChangeProtocolExporter: OptionChangeProtocolExporter
  ) {
    const createGitOptionAssistant = (
      key: string,
      targetValue: string,
      description: string
    ) =>
      new GitOptionAssistant(gitConfigurator, key, targetValue, description);
    const createVSCodeOptionAssistant = <T>(
      section: string,
      targetValue: T,
      description: string
    ) =>
      new VSCodeOptionAssistant<T>(
        vSCodeConfigurator,
        section,
        targetValue,
        description
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

  private async gatherDecisions(): Promise<{
    error: unknown;
    apply: boolean;
    pickedOptions: [OptionAssistant, Option][];
  }> {
    let apply = false;
    let pickedOptions: [OptionAssistant, Option][] = [];
    let error: unknown = undefined;
    try {
      let someNeedsChange = false;
      for (const assistant of this.optionsAssistants) {
        if (await assistant.getNeedsChange()) {
          someNeedsChange = true;
          break;
        }
      }
      if (!someNeedsChange) {
        return { apply, error, pickedOptions };
      }
      const nowItem = new Option("Now");
      const newerItem = new Option("Never");
      const newerWorkspaceItem = new Option("Never in this workspace");
      const postponeItem = new Option("Postpone");
      const skipOptionItem = new Option("Skip");
      const abortItem = new Option("Abort");
      const discardItem = new Option("Discard");
      const completeItem = new Option("Complete");
      const applyItem = new Option("Apply");
      const restartItem = new Option("Restart");

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await window.showInformationMessage(
          "Some current settings will not work well with VS Code as merge tool. " +
            "When do want to change them using dialogs?",
          nowItem,
          newerItem,
          newerWorkspaceItem,
          postponeItem
        );
        if (result !== nowItem) {
          if (result === newerItem || result === newerWorkspaceItem) {
            await this.setRunOnStartup(false, result === newerItem);
          }
          return { apply, error, pickedOptions };
        }

        let restart = false;
        let abort = false;
        pickedOptions = [];
        for (const assistant of this.optionsAssistants) {
          if (!(await assistant.getNeedsChange())) continue;
          const question = await assistant.provideQuestionData();
          question.options.push(skipOptionItem, abortItem, restartItem);
          const pickedOption = await this.ask(question);
          if (pickedOption === undefined || pickedOption === abortItem) {
            abort = true;
            break;
          } else if (pickedOption === skipOptionItem) {
            continue;
          } else if (pickedOption === restartItem) {
            restart = true;
            break;
          } else {
            pickedOptions.push([assistant, pickedOption]);
          }
        }
        if (abort) break;
        if (restart) continue;

        const pickedItem = await (pickedOptions.length === 0
          ? this.ask({
              question:
                "Settings assistant finished but no changes have been selected.",
              options: [completeItem, restartItem],
            })
          : this.ask({
              question: "Decisions have been gathered.",
              options: [applyItem, restartItem, discardItem],
            }));
        if (pickedItem === completeItem) {
          await this.setRunOnStartup(false, false);
        } else if (pickedItem === applyItem) {
          apply = true;
        } else if (pickedItem === restartItem) {
          continue;
        }
        break;
      }
    } catch (caughtError) {
      error = caughtError || "unknown error";
    }
    return { apply, error, pickedOptions };
  }

  private async applyDecisions(pickedOptions: [OptionAssistant, Option][]) {
    const optionChangeProtocol = new OptionChangeProtocol();
    const { error } = await this.applySelection(
      pickedOptions,
      optionChangeProtocol
    );
    if (error === undefined) {
      await this.setRunOnStartup(false, false);
    }
    if (optionChangeProtocol.entries.length > 0) {
      const saveProtocolOption = new Option("Save change protocol");
      const discardProtocolOption = new Option("Discard change protocol");
      const changesMadeStatement = "Changes were made.";
      const selectedOption = await (error !== undefined
        ? window.showErrorMessage(
            `Error on running the settings assistant. ` +
              `${changesMadeStatement} \n${JSON.stringify(error)}`,
            saveProtocolOption,
            discardProtocolOption
          )
        : window.showInformationMessage(
            `Successfully changed the settings.`,
            saveProtocolOption,
            discardProtocolOption
          ));
      if (selectedOption === saveProtocolOption) {
        try {
          await this.writeOptionChangeProtocol(optionChangeProtocol);
        } catch (error) {
          void window.showErrorMessage(
            `Error on writing the change protocol: ${JSON.stringify(error)}`
          );
        }
      }
    } else {
      const changesMadeStatement = "but no changes were protocolled.";
      await (error !== undefined
        ? window.showErrorMessage(
            `Error on running the settings assistant ` +
              `${changesMadeStatement} \n${JSON.stringify(error)}`
          )
        : window.showInformationMessage(
            `Settings assistant completed ${changesMadeStatement}`
          ));
    }
  }

  private async setRunOnStartup(
    value: boolean,
    global: boolean
  ): Promise<void> {
    await this.vSCodeConfigurator.set(
      settingsAssistantOnStartupSettingID,
      value,
      global
    );
  }

  private async applySelection(
    pickedOptions: [OptionAssistant, Option][],
    optionChangeProtocol: OptionChangeProtocol
  ): Promise<{ error: unknown }> {
    try {
      for (const [assistant, pickedOption] of pickedOptions) {
        await assistant.handlePickedOption(pickedOption, optionChangeProtocol);
      }
    } catch (error) {
      return { error: error || "unknown error" };
    }
    return { error: undefined };
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
  handlePickedOption(
    item: Option,
    changeProtocol: OptionChangeProtocol
  ): Promise<void>;
}

export class GitOptionAssistant implements OptionAssistant {
  constructor(
    private readonly configurator: GitConfigurator,
    private readonly key: string,
    private readonly targetValue: string,
    private readonly description: string
  ) {}
  async getNeedsChange(): Promise<boolean> {
    return (await this.configurator.get(this.key)) !== this.targetValue;
  }

  async provideQuestionData(): Promise<QuestionData> {
    const currentValue = await this.configurator.get(this.key);
    return {
      question:
        `Change Git option \`${this.key}\` from ` +
        (currentValue === undefined ? "unset" : `\`${currentValue}\``) +
        ` to \`${this.targetValue}\`. \n` +
        `Reason: ${this.description}`,
      options: [
        new Option(`Globally`, GitOptionAssistant.globalValue),
        new Option(`In repository`, GitOptionAssistant.repositoryValue),
      ],
    };
  }
  async handlePickedOption(
    item: Option,
    changeProtocol: OptionChangeProtocol
  ): Promise<void> {
    let global: boolean;
    if (item.value === GitOptionAssistant.repositoryValue) {
      global = false;
    } else if (item.value === GitOptionAssistant.globalValue) {
      global = true;
    } else {
      console.error("Unknown option");
      return;
    }
    const oldValue = await this.configurator.get(this.key);
    changeProtocol.log({
      type: "Git option",
      scope: global ? "global" : "in repository",
      key: this.key,
      oldValue: oldValue === undefined ? "(unset)" : oldValue,
      newValue: this.targetValue,
      reason: this.description,
    });
    await this.configurator.set(this.key, this.targetValue, global);
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
    private readonly description: string
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
        `Change VS Code option \`${this.section}\` ` +
        `from \`${JSON.stringify(currentValue)}\` ` +
        `to \`${JSON.stringify(this.targetValue)}\`. \n` +
        `Reason: ${this.description}`,
      options: [
        new Option(`Globally`, VSCodeOptionAssistant.globalValue),
        new Option(`In workspace`, VSCodeOptionAssistant.workspaceValue),
      ],
    });
  }
  async handlePickedOption(
    item: Option,
    changeProtocol: OptionChangeProtocol
  ): Promise<void> {
    let global: boolean;
    if (item.value === VSCodeOptionAssistant.globalValue) {
      global = true;
    } else if (item.value === VSCodeOptionAssistant.workspaceValue) {
      global = false;
    } else {
      console.error("Unknown option");
      return;
    }
    const oldValue = await this.configurator.get(this.section);
    const workspaceDirectory = getWorkspaceDirectoryUri();
    changeProtocol.log({
      type: "VSCode option",
      scope: global
        ? "global"
        : `in workspace ${workspaceDirectory?.fsPath ?? "undefined"}`,
      key: this.section,
      oldValue: oldValue === undefined ? "(unset)" : oldValue,
      newValue: this.targetValue,
      reason: this.description,
    });
    await this.configurator.set(this.section, this.targetValue, global);
  }

  private static readonly globalValue = "globally";
  private static readonly workspaceValue = "in workspace";
}

export class SettingsAssistantLauncher implements Disposable {
  public register(): void {
    this.disposables.push(
      commands.registerCommand(
        runSettingsAssistantCommandID,
        this.tryLaunch.bind(this)
      )
    );
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  public async tryLaunchOnStartup(): Promise<void> {
    if (this.vSCodeConfigurator.get(settingsAssistantOnStartupSettingID)) {
      await this.tryLaunch();
    }
  }

  public async tryLaunch(): Promise<void> {
    if (this.monitor.inUse) {
      void window.showWarningMessage(
        "The settings assistant is already running."
      );
      return;
    }
    try {
      await this.monitor.enter();
      const gitPath = await getVSCGitPathInteractively();
      const workspaceDirectoryUri = getWorkspaceDirectoryUri();
      if (gitPath === undefined || workspaceDirectoryUri === undefined) {
        return;
      }
      const process = new SettingsAssistant(
        new GitConfigurator(gitPath, workspaceDirectoryUri),
        this.vSCodeConfigurator,
        this.optionChangeProtocolExporter
      );
      await process.launch();
    } finally {
      await this.monitor.leave();
    }
  }

  public constructor(
    private readonly vSCodeConfigurator: VSCodeConfigurator,
    private readonly optionChangeProtocolExporter: OptionChangeProtocolExporter
  ) {}

  private readonly monitor = new Monitor();
  private disposables: Disposable[] = [];
}

export interface OptionChangeProtocolEntry {
  type: string;
  scope: string;
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
          ["  scope: ", entry.scope],
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
