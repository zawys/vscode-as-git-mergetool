import { defaultVSCodeConfigurator } from "./vSCodeConfigurator";
import { Monitor } from "./monitor";
import { extensionID } from "./iDs";
import { defaultExtensionContextManager } from "./extensionContextManager";
import { Lazy } from "./lazy";

export class TemporarySideBySideSettingsManager {
  public async activateSettings() {
    await this.monitor.enter();
    try {
      const oldOrigActual = this.getStorageState(origActualKey);
      const oldOrigTarget = this.getStorageState(origTargetKey);
      const newOrigActual: StorageState = {};
      const newOrigTarget: StorageState = {};

      const obsoleteSettingKeys: Set<string> =
        new Set(Object.keys(oldOrigActual));

      for (const iD of this.targetIDs) {
        obsoleteSettingKeys.delete(iD);
        const newTarget = this.targetSettings[iD];
        const newActual = this.vSCodeConfigurator.get(iD);
        if (newActual !== newTarget) {
          this.vSCodeConfigurator.set(iD, newTarget);
        }

        // in the latter case, user did change config setting afterwards,
        // so we will restore it later to the new value
        newOrigActual[iD] = newActual === oldOrigTarget[iD] ?
          oldOrigActual[iD] :
          newActual;

        newOrigTarget[iD] = newTarget;
      }
      for (const iD of obsoleteSettingKeys) {
        this.vSCodeConfigurator.set(iD, oldOrigActual[iD]);
      }
      this.setStorageState(origActualKey, newOrigActual);
      this.setStorageState(origTargetKey, newOrigTarget);
    } finally {
      await this.monitor.leave();
    }
  }

  public async resetSettings() {
    await this.monitor.enter();
    try {
      const origActual = this.getStorageState(origActualKey);
      const origTarget = this.getStorageState(origTargetKey);
      const origChangedIDs = Object.keys(origActual);
      for (const iD of origChangedIDs) {
        const newActual = this.vSCodeConfigurator.get(iD);
        if (newActual === origTarget[iD]) {
          this.vSCodeConfigurator.set(iD, origActual[iD]);
        }
      }
      this.setStorageState(origActualKey, undefined);
      this.setStorageState(origTargetKey, undefined);
    } finally {
      await this.monitor.leave();
    }
  }

  public constructor(
    private readonly vSCodeConfigurator = defaultVSCodeConfigurator,
    private readonly monitor = new Monitor(),
    private readonly targetSettings: StorageState = {
      "diffEditor.renderSideBySide": false,
      "editor.lineNumbers": "none",
    },
    private readonly workspaceState =
      defaultExtensionContextManager.value.workspaceState,
  ) {
    this.targetIDs = Object.keys(targetSettings);
  }

  private targetIDs: string[];

  private getStorageState(key: string): StorageState {
    const value = this.workspaceState.get(key);
    if (typeof value === "object") {
      // workspaceState.get returns JSON serializable objects.
      return value as StorageState;
    }
    return {};
  }

  private setStorageState(key: string, value: StorageState | undefined) {
    this.workspaceState.update(key, value);
  }
}

export const defaultTemporarySideBySideSettingsManagerLazy =
  new Lazy(() => new TemporarySideBySideSettingsManager());

type StorageState = { [k: string]: unknown };

const origActualKey = `${extensionID}.temporarySettings.origActual`;
const origTargetKey = `${extensionID}.temporarySettings.origTarget`;
