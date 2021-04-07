import assert from "assert";
import {
  GitConfigurator,
  GitOptionAssistant,
  OptionChangeProtocol,
} from "../../../../src/settingsAssistant";
import {
  getWorkspaceDirectoryUri,
  getVSCGitPath,
} from "../../../../src/getPathsWithinVSCode";

suite("GitOptionAssistant", function () {
  let gitConfigurator: GitConfigurator | undefined = undefined;
  let sut: GitOptionAssistant | undefined = undefined;
  let changeProtocol: OptionChangeProtocol | undefined = undefined;
  const targetValue = "random.stuff@example.com";
  const configKey = "user.email";
  this.beforeAll(async () => {
    const gitPath = await getVSCGitPath();
    if (gitPath === undefined) throw new Error("gitPath undefined");
    const workingDirectory = getWorkspaceDirectoryUri();
    if (workingDirectory === undefined) {
      throw new Error("workingDirectory undefined");
    }
    gitConfigurator = new GitConfigurator(gitPath, workingDirectory);
    changeProtocol = new OptionChangeProtocol();
    sut = new GitOptionAssistant(
      gitConfigurator,
      configKey,
      targetValue,
      "some text"
    );
  });

  test("shows that it needs a change", async () => {
    if (sut === undefined) throw new Error("sut undefined");
    if (gitConfigurator === undefined)
      throw new Error("gitConfigurator undefined");
    const needsChange = await sut.getNeedsChange();
    assert(needsChange);
  });

  test("shows that it does not need a change", async () => {
    if (gitConfigurator === undefined) {
      throw new Error("gitConfigurator undefined");
    }
    if (changeProtocol === undefined) {
      throw new Error("changeProtocol undefined");
    }
    const configKey2 = "user.name";
    const actualValue = await gitConfigurator.get(configKey2);
    if (actualValue === undefined) {
      throw new Error("improper environment for test");
    }
    const sut2 = new GitOptionAssistant(
      gitConfigurator,
      configKey2,
      actualValue,
      ""
    );
    assert(!(await sut2.getNeedsChange()));
  });

  test("updates the configuration", async () => {
    if (gitConfigurator === undefined) {
      throw new Error("gitConfigurator undefined");
    }
    if (sut === undefined) {
      throw new Error("sut undefined");
    }
    if (changeProtocol === undefined) {
      throw new Error("changeProtocol undefined");
    }
    const oldValue = await gitConfigurator.get(configKey, false);
    if (oldValue === undefined || oldValue == targetValue) {
      throw new Error("improper test environment");
    }
    const questionsData = await sut.provideQuestionData();
    const inRepositoryOption = questionsData.options.find(
      (option) => option.value === "in repository"
    );
    assert(
      inRepositoryOption !== undefined,
      'provides option with value "in repository"'
    );
    if (inRepositoryOption === undefined) {
      throw new Error("assertion did not work?!");
    }
    await sut.handlePickedOption(inRepositoryOption, changeProtocol);
    const newValue = await gitConfigurator.get(configKey, false);
    assert.strictEqual(newValue, targetValue, "updates the option");
  });
});
