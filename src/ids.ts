export const extensionID = "vscode-as-git-mergetool";
export const fullExtensionID = `zawys.${extensionID}`;
export const labelsInStatusBarSettingID = `${extensionID}.labelsInStatusBar`;

export function firstLetterUppercase(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value[0].toLocaleUpperCase() + value.slice(1);
}
