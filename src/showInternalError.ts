// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { window } from "vscode";

export function showInternalError(id: string): void {
  void window.showErrorMessage(`Internal assumption violated. (${id})`);
}
