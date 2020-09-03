import * as vscode from "vscode";
import { ExtensionAPI } from "../extension";
import { fullExtensionID } from "../iDs";

export async function getExtensionAPI(): Promise<ExtensionAPI> {
  const extension = vscode.extensions.getExtension(fullExtensionID);
  if (extension === undefined) {
    throw new Error("extension not found");
  }
  const extensionAPI = (await extension.activate()) as unknown;
  if (!extension.isActive) {
    throw new Error("extension is not active");
  }
  if (extensionAPI === undefined) {
    throw new Error("extension API not found");
  } else if (!(extensionAPI instanceof ExtensionAPI)) {
    throw new TypeError("extensionAPI has unexpected type");
  }
  return extensionAPI;
}
