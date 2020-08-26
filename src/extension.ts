import * as vscode from 'vscode';
import * as mergetool from './mergetool';
import { SettingsAssistantCreator } from './settingsAssistant';
import { DiffLayoutManager } from './diffLayoutManager';

let extension: Extension | undefined;

export async function activate(context: vscode.ExtensionContext) {
	extension = new Extension();
	await extension.activate();
}

// this method is called when your extension is deactivated
export async function deactivate() {
	await extension?.deactivate();
	extension = undefined;
}

export class Extension {
	public async activate() {
		await this.diffLayoutManager.register();
		this.mergetoolProcess.register();
		setTimeout(() => (new SettingsAssistantCreator()).tryLaunch(), 4000);
	}

	public async deactivate() {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
		}
		await Promise.all([
			this.diffLayoutManager.dispose(),
			this.mergetoolProcess.dispose(),
		]);
	}

	public constructor(
		private readonly diffLayoutManager = new DiffLayoutManager(),
		private readonly mergetoolProcess =
			new mergetool.MergetoolProcess(diffLayoutManager),
	) { }

	private timer: NodeJS.Timeout | undefined = undefined;
}
