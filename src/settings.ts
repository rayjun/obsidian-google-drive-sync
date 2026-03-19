import { App, PluginSettingTab, Setting } from "obsidian";
import type GoogleDriveSyncPlugin from "./main";
import type { SyncLogEntry } from "./main";

export interface GoogleDriveSyncSettings {
	clientId: string;
	clientSecret: string;
	accessToken: string;
	refreshToken: string;
	tokenExpiry: number;
	syncInterval: number;
	driveFolderName: string;
	excludePatterns: string[];
}

export const DEFAULT_SETTINGS: GoogleDriveSyncSettings = {
	clientId: "",
	clientSecret: "",
	accessToken: "",
	refreshToken: "",
	tokenExpiry: 0,
	syncInterval: 5,
	driveFolderName: "Obsidian-Vault",
	excludePatterns: [".obsidian/**", ".DS_Store", "Thumbs.db"],
};

export class GoogleDriveSyncSettingTab extends PluginSettingTab {
	plugin: GoogleDriveSyncPlugin;
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(app: App, plugin: GoogleDriveSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private debouncedSave(): void {
		if (this.saveTimeout) clearTimeout(this.saveTimeout);
		this.saveTimeout = setTimeout(() => {
			this.plugin.saveSettings();
		}, 500);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Google Drive Sync Settings" });

		// Google Account section
		containerEl.createEl("h3", { text: "Google Account" });

		new Setting(containerEl)
			.setName("Client ID")
			.setDesc("OAuth 2.0 Client ID from Google Cloud Console")
			.addText((text) =>
				text
					.setPlaceholder("Enter Client ID")
					.setValue(this.plugin.settings.clientId)
					.onChange((value) => {
						this.plugin.settings.clientId = value;
						this.debouncedSave();
					})
			);

		new Setting(containerEl)
			.setName("Client Secret")
			.setDesc("OAuth 2.0 Client Secret from Google Cloud Console")
			.addText((text) =>
				text
					.setPlaceholder("Enter Client Secret")
					.setValue(this.plugin.settings.clientSecret)
					.onChange((value) => {
						this.plugin.settings.clientSecret = value;
						this.debouncedSave();
					})
			);

		const isLoggedIn = !!this.plugin.settings.refreshToken;
		new Setting(containerEl)
			.setName("Authentication")
			.setDesc(isLoggedIn ? "Logged in to Google Drive" : "Not logged in")
			.addButton((button) =>
				button
					.setButtonText(isLoggedIn ? "Logout" : "Login to Google Drive")
					.onClick(async () => {
						if (isLoggedIn) {
							this.plugin.settings.accessToken = "";
							this.plugin.settings.refreshToken = "";
							this.plugin.settings.tokenExpiry = 0;
							await this.plugin.saveSettings();
						} else {
							await this.plugin.startOAuthFlow();
						}
						this.display();
					})
			);

		// Manual auth code fallback
		if (!isLoggedIn && this.plugin.hasPendingOAuth()) {
			new Setting(containerEl)
				.setName("Paste authorization code")
				.setDesc(
					"If the automatic redirect didn't work, paste the authorization code here"
				)
				.addText((text) =>
					text.setPlaceholder("4/0Axx...").onChange(() => {})
				)
				.addButton((button) =>
					button.setButtonText("Submit").onClick(async () => {
						const input = containerEl.querySelector(
							'input[placeholder="4/0Axx..."]'
						) as HTMLInputElement;
						if (input?.value) {
							await this.plugin.handleManualAuthCode(input.value);
							this.display();
						}
					})
				);
		}

		// Sync section
		containerEl.createEl("h3", { text: "Sync Settings" });

		new Setting(containerEl)
			.setName("Sync interval")
			.setDesc("How often to sync (in minutes)")
			.addSlider((slider) =>
				slider
					.setLimits(1, 60, 1)
					.setValue(this.plugin.settings.syncInterval)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.syncInterval = value;
						await this.plugin.saveSettings();
						this.plugin.resetSyncTimer();
					})
			);

		new Setting(containerEl)
			.setName("Drive folder name")
			.setDesc("Root folder name on Google Drive")
			.addText((text) =>
				text
					.setPlaceholder("Obsidian-Vault")
					.setValue(this.plugin.settings.driveFolderName)
					.onChange((value) => {
						this.plugin.settings.driveFolderName = value;
						this.debouncedSave();
					})
			);

		new Setting(containerEl)
			.setName("Exclude patterns")
			.setDesc("Glob patterns to exclude (one per line)")
			.addTextArea((text) =>
				text
					.setPlaceholder(".obsidian/**\n.DS_Store")
					.setValue(this.plugin.settings.excludePatterns.join("\n"))
					.onChange((value) => {
						this.plugin.settings.excludePatterns = value
							.split("\n")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						this.debouncedSave();
					})
			);

		// Sync History section
		containerEl.createEl("h3", { text: "Sync History" });

		const log = this.plugin.syncLog;
		if (log.length === 0) {
			containerEl.createEl("p", {
				text: "No sync records yet.",
				cls: "setting-item-description",
			});
		} else {
			const table = containerEl.createEl("table", { cls: "gdrive-sync-log" });
			const thead = table.createEl("thead");
			const headerRow = thead.createEl("tr");
			headerRow.createEl("th", { text: "Time" });
			headerRow.createEl("th", { text: "↑ Up" });
			headerRow.createEl("th", { text: "↓ Down" });
			headerRow.createEl("th", { text: "🗑 Del" });
			headerRow.createEl("th", { text: "Status" });

			const tbody = table.createEl("tbody");
			for (const entry of log) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: this.formatTime(entry.timestamp) });
				row.createEl("td", { text: String(entry.uploaded) });
				row.createEl("td", { text: String(entry.downloaded) });
				row.createEl("td", { text: String(entry.deleted) });
				if (entry.errorMessage) {
					row.createEl("td", {
						text: `✗ ${entry.errorMessage}`,
						cls: "gdrive-sync-error",
					});
				} else if (entry.errors > 0) {
					row.createEl("td", {
						text: `✗ ${entry.errors} error(s)`,
						cls: "gdrive-sync-error",
					});
				} else {
					row.createEl("td", { text: "✓ OK" });
				}
			}
		}
	}

	private formatTime(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const isToday =
			date.getFullYear() === now.getFullYear() &&
			date.getMonth() === now.getMonth() &&
			date.getDate() === now.getDate();
		const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
		if (isToday) {
			return time;
		}
		const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
		return `${dateStr} ${time}`;
	}
}
