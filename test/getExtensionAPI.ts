import { extensions } from "vscode";
import { ExtensionAPI } from "../src/extension";
import { fullExtensionID } from "../src/ids";

export async function getExtensionAPI(): Promise<ExtensionAPI> {
  const extension = extensions.getExtension(fullExtensionID);
  if (extension === undefined) {
    throw new Error("extension not found");
  }
  const extensionAPI = (await extension.activate()) as unknown;
  if (!extension.isActive) {
    throw new Error("extension is not active");
  }
  if (extensionAPI === undefined) {
    throw new Error("extension API not found");
  } else if (
    !(extensionAPI as ExtensionAPI).activate &&
    !(extensionAPI as ExtensionAPI).deactivate &&
    !(extensionAPI as ExtensionAPI).diffLayouterManager
  ) {
    throw new TypeError("extensionAPI has unexpected type");
  }
  return extensionAPI as ExtensionAPI;
}
