// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { Disposable } from "vscode";

export interface RegisterableService extends Disposable {
  register(): void | Promise<void>;
}
