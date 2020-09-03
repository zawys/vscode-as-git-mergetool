import * as assert from "assert";
import * as vscode from "vscode";
import {
  gitMergetoolContinueCommandID,
  gitMergetoolStartCommandID,
} from "../../../../mergetoolUI";
import { getExtensionAPI } from "../../../getExtensionAPI";

suite("extension", () => {
  test("can go through merge process", async () => {
    const extensionAPI = await getExtensionAPI();
    await vscode.commands.executeCommand(gitMergetoolStartCommandID);
    await new Promise((resolve) => setTimeout(resolve, 100000000));
    assert(extensionAPI.mergetoolUI.mergeSituation !== undefined);
    assert(extensionAPI.mergetoolUI.mergeSituationInLayout);
    await vscode.commands.executeCommand("merge-conflict.accept.both");
    await vscode.commands.executeCommand(gitMergetoolContinueCommandID);
    assert(extensionAPI.mergetoolUI.processManager?.isRunning !== true);
  });
});
