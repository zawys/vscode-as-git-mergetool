// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import {
  deactivate as extensionDeactivate,
  activate as extensionActivate,
  ExtensionAPI,
} from "../src/extension";
import { ExtensionContext } from "vscode";

export function activate(context: ExtensionContext): Promise<ExtensionAPI> {
  return extensionActivate(context);
}

// this method is called when your extension is deactivated
export function deactivate(): void {
  extensionDeactivate();
}
