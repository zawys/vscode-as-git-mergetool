// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { Uri } from "vscode";
import { UIError } from "./uIError";

export interface EditorOpenHandler {
  readonly pathsToIgnore: string[];
  handleDidOpenURI(uRI: Uri): Promise<boolean | UIError>;
}
