import * as vscode from 'vscode';

export class VSCodeConfigurator {
  constructor() { }

  public get<T>(section: string): T | undefined {
    const [parent, key] = separateSmallestKey(section);
    return vscode.workspace.getConfiguration(parent).get(key);
  }

  public async set(
    section: string, value: unknown, global: boolean = true
  ): Promise<void> {
    const [parent, key] = separateSmallestKey(section);
    await vscode.workspace.getConfiguration(parent).update(
      key,
      value,
      global ?
        vscode.ConfigurationTarget.Global :
        vscode.ConfigurationTarget.Workspace,
    );
  }
}

export const defaultVSCodeConfigurator = new VSCodeConfigurator();

export function separateSmallestKey(section: string): [string | undefined, string] {
  const match = smallestKeyRE.exec(section);
  if (match === null) {
    return [undefined, section];
  } else {
    return [match[1], match[2]];
  }
}

const smallestKeyRE = /^(.+)\.([^.]+)$/;
