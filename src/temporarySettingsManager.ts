import { defaultVSCodeConfigurator } from "./vSCodeConfigurator";
import { Monitor } from "./monitor";

export class TemporarySideBySideSettingsManager {
  public async activateSettings() {
    await this.monitor.enter();
    try {
      for (let i = 0; i < this.settingIDs.length; i++) {
        const iD = this.settingIDs[i];
        this.prevSettingValues[i] = this.vSCodeConfigurator.get(iD);
        if (this.prevSettingValues[i] !== this.targetSettingValues[i]) {
          await this.vSCodeConfigurator.set(
            iD, this.targetSettingValues[i], false
          );
        }
      }
    } finally {
      await this.monitor.leave();
    }
  }

  public async resetSettings() {
    await this.monitor.enter();
    try {
      for (let i = 0; i < this.settingIDs.length; i++) {
        const iD = this.settingIDs[i];
        if (this.prevSettingValues[i] !== this.targetSettingValues[i]) {
          await this.vSCodeConfigurator.set(iD, undefined, false);
        }
      }
    } finally {
      await this.monitor.leave();
    }
  }

  public constructor(
    private readonly vSCodeConfigurator = defaultVSCodeConfigurator,
    private readonly monitor = new Monitor(),
    private readonly settingIDs = [
      "diffEditor.renderSideBySide",
      "editor.lineNumbers",
    ],
    private readonly targetSettingValues = [
      false,
      "none",
    ],
  ) { }

  private readonly prevSettingValues: unknown[] = [];
}

export const defaultTemporarySideBySideSettingsManager =
  new TemporarySideBySideSettingsManager();
