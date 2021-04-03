import assert from "assert";
import { getGitPath } from "../../../../src/getPaths";
import { getWorkingDirectoryUri } from "../../../../src/getPathsWithinVSCode";
import { GitConfigurator } from "../../../../src/settingsAssistant";

suite("GitConfigurator", function () {
  let sut: GitConfigurator | undefined = undefined;

  this.beforeAll(async () => {
    const gitPath = await getGitPath();
    if (gitPath === undefined) throw new Error("gitPath undefined");
    const workingDirectory = getWorkingDirectoryUri();
    if (workingDirectory === undefined) {
      throw new Error("workingDirectory undefined");
    }
    sut = new GitConfigurator(gitPath, workingDirectory);
  });

  test("reads and stores local configuration", async () => {
    if (sut === undefined) throw new Error("sut undefined");
    const configName = "user.name";
    const targetConfigValue = "Random Stuff";
    const currentValue = await sut.get(configName);
    assert.strictEqual(currentValue, "Betty Smith", "initial value");
    await sut.set(configName, targetConfigValue, false);
    const newValue = await sut.get(configName);
    assert.strictEqual(newValue, targetConfigValue, "setting is updated");
  });

  test("reads global configuration", async () => {
    if (sut === undefined) throw new Error("sut undefined");
    const configName = "user.name";
    const localTargetValue = "Betty Smith";
    await sut.set(configName, localTargetValue, false);
    const actualLocalValue = await sut.get(configName);
    assert.strictEqual(
      actualLocalValue,
      localTargetValue,
      "does return local value"
    );
    const actualGlobalValue = await sut.get(configName, true);
    assert(
      actualGlobalValue !== localTargetValue,
      "does not return local value"
    );
  });
});
