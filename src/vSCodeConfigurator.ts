import { ConfigurationTarget, workspace } from "vscode";

export class VSCodeConfigurator {
  public get(section: string): unknown | undefined {
    const [parent, key] = separateSmallestKey(section);
    const result = workspace.getConfiguration(parent).get(key);
    return result;
  }

  public async set(
    section: string,
    value: unknown,
    global = true
  ): Promise<void> {
    const [parent, key] = separateSmallestKey(section);
    global ||=
      workspace.workspaceFolders === undefined ||
      workspace.workspaceFolders.length === 0;
    await workspace
      .getConfiguration(parent)
      .update(
        key,
        value,
        global ? ConfigurationTarget.Global : ConfigurationTarget.Workspace
      );
  }

  public inspect(section: string): InspectResult<unknown> | undefined {
    const [parent, key] = separateSmallestKey(section);
    return workspace.getConfiguration(parent).inspect(key);
  }
}

export function separateSmallestKey(
  section: string
): [string | undefined, string] {
  const match = smallestKeyRE.exec(section);
  return match === null ? [undefined, section] : [match[1], match[2]];
}

export interface InspectResult<T> {
  key: string;

  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;

  defaultLanguageValue?: T;
  globalLanguageValue?: T;
  workspaceLanguageValue?: T;
  workspaceFolderLanguageValue?: T;

  languageIds?: string[];
}

const smallestKeyRE = /^(.+)\.([^.]+)$/;
