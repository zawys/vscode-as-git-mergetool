// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as vscode from "vscode";
import { SingletonStore } from "./singletonStore";

export const defaultExtensionContextManager = new SingletonStore<
  vscode.ExtensionContext
>();
