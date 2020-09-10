// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as vscode from "vscode";
import { ExtensionAPI } from "../src/extension";
import { fullExtensionID } from "../src/iDs";

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
  } else if (
    !(extensionAPI as ExtensionAPI).register &&
    !(extensionAPI as ExtensionAPI).dispose &&
    !(extensionAPI as ExtensionAPI).services?.diffLayouterManager
  ) {
    throw new TypeError("extensionAPI has unexpected type");
  }
  return extensionAPI as ExtensionAPI;
}
