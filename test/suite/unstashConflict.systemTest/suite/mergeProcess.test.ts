import assert from "assert";
import { commands } from "vscode";
import { nextMergeStepCommandID } from "../../../../src/mergetoolUI";
import { getExtensionAPI } from "../../../getExtensionAPI";

suite("extension", () => {
  test("can go through merge process", async () => {
    const extensionAPI = await getExtensionAPI();
    await commands.executeCommand(nextMergeStepCommandID);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert(extensionAPI.mergetoolUI.mergeSituation !== undefined);
    assert(extensionAPI.mergetoolUI.mergeSituationInLayout);
    await commands.executeCommand("merge-conflict.accept.both");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await commands.executeCommand(nextMergeStepCommandID);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert(extensionAPI.mergetoolUI.processManager?.isRunning !== true);
  });
});
