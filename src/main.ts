// Stub — will be replaced in Task 9
import { Plugin } from "obsidian";

export default class GoogleDriveSyncPlugin extends Plugin {
	settings: any = {};
	async startOAuthFlow(): Promise<void> {}
	resetSyncTimer(): void {}
	async saveSettings(): Promise<void> {}
	async onload() {}
	onunload() {}
}
