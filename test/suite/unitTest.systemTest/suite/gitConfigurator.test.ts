// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import assert from "assert";
import { getGitPath } from "../../../../src/getPaths";
import { getWorkspaceDirectoryUri } from "../../../../src/getPathsWithinVSCode";
import { GitConfigurator } from "../../../../src/settingsAssistant";
import { isUIError } from "../../../../src/uIError";

suite("GitConfigurator", function () {
  let sut: GitConfigurator | undefined = undefined;

  this.beforeAll(async () => {
    const gitPath = await getGitPath();
    if (isUIError(gitPath)) throw new Error(gitPath.message);
    const workingDirectory = getWorkspaceDirectoryUri();
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
