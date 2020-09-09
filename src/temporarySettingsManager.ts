// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { VSCodeConfigurator } from "./vSCodeConfigurator";
import { Monitor } from "./monitor";
import { extensionID } from "./iDs";
import { defaultExtensionContextManager } from "./extensionContextManager";
import { commands, Disposable } from "vscode";

export class TemporarySettingsManager implements Disposable {
  public async activateSettings(): Promise<void> {
    await this.monitor.enter();
    try {
      const oldOrigActual = this.getStorageState(origActualKey);
      const oldOrigTarget = this.getStorageState(origTargetKey);
      const newOrigActual: StorageState = {};
      const newOrigTarget: StorageState = {};

      const obsoleteSettingKeys: Set<string> = new Set(
        Object.keys(oldOrigActual)
      );

      for (const iD of this.targetIDs) {
        obsoleteSettingKeys.delete(iD);
        const newTarget = this.targetSettings[iD];
        const newActual = this.vSCodeConfigurator.get(iD);
        if (newActual !== newTarget) {
          await this.vSCodeConfigurator.set(iD, newTarget);
        }

        // in the latter case, user did change config setting afterwards,
        // so we will restore it later to the new value
        newOrigActual[iD] =
          newActual === oldOrigTarget[iD] ? oldOrigActual[iD] : newActual;

        newOrigTarget[iD] = newTarget;
      }
      for (const iD of obsoleteSettingKeys) {
        await this.vSCodeConfigurator.set(iD, oldOrigActual[iD]);
      }
      await this.setStorageState(origActualKey, newOrigActual);
      await this.setStorageState(origTargetKey, newOrigTarget);
    } finally {
      await this.monitor.leave();
    }
  }

  public async resetSettings(): Promise<void> {
    await this.monitor.enter();
    try {
      const origActual = this.getStorageState(origActualKey);
      const origTarget = this.getStorageState(origTargetKey);
      const origChangedIDs = Object.keys(origActual);
      for (const iD of origChangedIDs) {
        const newActual = this.vSCodeConfigurator.get(iD);
        if (newActual === origTarget[iD]) {
          await this.vSCodeConfigurator.set(iD, origActual[iD]);
        }
      }
      await this.setStorageState(origActualKey, undefined);
      await this.setStorageState(origTargetKey, undefined);
    } finally {
      await this.monitor.leave();
    }
  }

  public register(): void {
    this.disposables.push(
      commands.registerCommand(resetTemporarySettingsCommandID, async () => {
        await this.resetSettings();
      })
    );
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  public constructor(
    private readonly vSCodeConfigurator: VSCodeConfigurator,
    private readonly monitor = new Monitor(),
    private readonly targetSettings: StorageState = {
      "diffEditor.renderSideBySide": false,
      "editor.lineNumbers": "none",
      "workbench.editor.showTabs": false,
      "editor.glyphMargin": false,
      "workbench.activityBar.visible": false,
    },
    private readonly storageState = defaultExtensionContextManager.value
      .globalState
  ) {
    this.targetIDs = Object.keys(targetSettings);
  }

  private targetIDs: string[];
  private disposables: Disposable[] = [];

  private getStorageState(key: string): StorageState {
    const value = this.storageState.get(key);
    if (typeof value === "object") {
      // workspaceState.get returns JSON serializable objects.
      return value as StorageState;
    }
    return {};
  }

  private async setStorageState(
    key: string,
    value: StorageState | undefined
  ): Promise<void> {
    await this.storageState.update(key, value);
  }
}

type StorageState = { [k: string]: unknown };

const origActualKey = `${extensionID}.temporarySettings.origActual`;
const origTargetKey = `${extensionID}.temporarySettings.origTarget`;
const resetTemporarySettingsCommandID =
  "vscode-as-git-mergetool.resetTemporarySettings";
