import * as assert from "assert";
import * as vscode from "vscode";
import { nextMergeStepCommandID } from "../../../../mergetoolUI";
import { getExtensionAPI } from "../../../getExtensionAPI";

suite("extension", () => {
  test("can go through merge process", async () => {
    const extensionAPI = await getExtensionAPI();
    await vscode.commands.executeCommand(nextMergeStepCommandID);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert(extensionAPI.mergetoolUI.mergeSituation !== undefined);
    assert(extensionAPI.mergetoolUI.mergeSituationInLayout);
    await vscode.commands.executeCommand("merge-conflict.accept.both");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await vscode.commands.executeCommand(nextMergeStepCommandID);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert(extensionAPI.mergetoolUI.processManager?.isRunning !== true);
  });
});
