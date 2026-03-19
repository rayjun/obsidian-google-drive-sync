import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import type GoogleDriveSyncPlugin from "./main";
import type { SyncLogEntry } from "./main";
import { t, resolveLocale, setLocale } from "./i18n";
import type { LanguageSetting } from "./i18n";

export interface GoogleDriveSyncSettings {
	clientId: string;
	clientSecret: string;
	accessToken: string;
	refreshToken: string;
	tokenExpiry: number;
	syncInterval: number;
	driveFolderName: string;
	excludePatterns: string[];
	language: LanguageSetting;
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
	language: "auto",
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

	/**
	 * Create a password-style text input with a toggle visibility button.
	 */
	private addMaskedText(
		setting: Setting,
		placeholder: string,
		value: string,
		onChange: (value: string) => void
	): void {
		setting.addText((text) => {
			text
				.setPlaceholder(placeholder)
				.setValue(value)
				.onChange(onChange);
			text.inputEl.type = "password";
			text.inputEl.style.fontFamily = "monospace";
		});

		setting.addExtraButton((button) => {
			button.setIcon("eye");
			button.setTooltip("Toggle visibility");
			button.onClick(() => {
				const input = setting.settingEl.querySelector(
					"input"
				) as HTMLInputElement;
				if (input) {
					const isHidden = input.type === "password";
					input.type = isHidden ? "text" : "password";
					setIcon(
						button.extraSettingsEl,
						isHidden ? "eye-off" : "eye"
					);
				}
			});
		});
	}

	display(): void {
		// Resolve and set locale before rendering
		setLocale(resolveLocale(this.plugin.settings.language));

		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: t("settings.title") });

		// Language setting (at the top)
		new Setting(containerEl)
			.setName(t("settings.language"))
			.setDesc(t("settings.languageDesc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", t("settings.languageAuto"))
					.addOption("en", "English")
					.addOption("zh", "中文")
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as LanguageSetting;
						await this.plugin.saveSettings();
						// Re-render with new locale
						this.display();
					})
			);

		// Google Account section
		containerEl.createEl("h3", { text: t("settings.googleAccount") });

		const clientIdSetting = new Setting(containerEl)
			.setName(t("settings.clientId"))
			.setDesc(t("settings.clientIdDesc"));
		this.addMaskedText(
			clientIdSetting,
			t("settings.clientIdPlaceholder"),
			this.plugin.settings.clientId,
			(value) => {
				this.plugin.settings.clientId = value;
				this.debouncedSave();
			}
		);

		const clientSecretSetting = new Setting(containerEl)
			.setName(t("settings.clientSecret"))
			.setDesc(t("settings.clientSecretDesc"));
		this.addMaskedText(
			clientSecretSetting,
			t("settings.clientSecretPlaceholder"),
			this.plugin.settings.clientSecret,
			(value) => {
				this.plugin.settings.clientSecret = value;
				this.debouncedSave();
			}
		);

		const isLoggedIn = !!this.plugin.settings.refreshToken;
		new Setting(containerEl)
			.setName(t("settings.authentication"))
			.setDesc(
				isLoggedIn
					? t("settings.loggedIn")
					: t("settings.notLoggedIn")
			)
			.addButton((button) =>
				button
					.setButtonText(
						isLoggedIn
							? t("settings.logoutButton")
							: t("settings.loginButton")
					)
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
				.setName(t("settings.pasteAuthCode"))
				.setDesc(t("settings.pasteAuthCodeDesc"))
				.addText((text) =>
					text.setPlaceholder("4/0Axx...").onChange(() => {})
				)
				.addButton((button) =>
					button
						.setButtonText(t("settings.submitButton"))
						.onClick(async () => {
							const input = containerEl.querySelector(
								'input[placeholder="4/0Axx..."]'
							) as HTMLInputElement;
							if (input?.value) {
								await this.plugin.handleManualAuthCode(
									input.value
								);
								this.display();
							}
						})
				);
		}

		// Sync section
		containerEl.createEl("h3", { text: t("settings.syncSettings") });

		new Setting(containerEl)
			.setName(t("settings.syncInterval"))
			.setDesc(t("settings.syncIntervalDesc"))
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
			.setName(t("settings.driveFolderName"))
			.setDesc(t("settings.driveFolderNameDesc"))
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
			.setName(t("settings.excludePatterns"))
			.setDesc(t("settings.excludePatternsDesc"))
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
		containerEl.createEl("h3", { text: t("settings.syncHistory") });

		const log = this.plugin.syncLog;
		if (log.length === 0) {
			containerEl.createEl("p", {
				text: t("settings.noSyncRecords"),
				cls: "setting-item-description",
			});
		} else {
			const table = containerEl.createEl("table", {
				cls: "gdrive-sync-log",
			});
			const thead = table.createEl("thead");
			const headerRow = thead.createEl("tr");
			headerRow.createEl("th", { text: t("settings.headerTime") });
			headerRow.createEl("th", { text: t("settings.headerUp") });
			headerRow.createEl("th", { text: t("settings.headerDown") });
			headerRow.createEl("th", { text: t("settings.headerDel") });
			headerRow.createEl("th", { text: t("settings.headerStatus") });

			const tbody = table.createEl("tbody");
			for (const entry of log) {
				const row = tbody.createEl("tr");
				row.createEl("td", {
					text: this.formatTime(entry.timestamp),
				});
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
						text: t("settings.statusErrors", {
							count: entry.errors,
						}),
						cls: "gdrive-sync-error",
					});
				} else {
					row.createEl("td", { text: t("settings.statusOk") });
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
		const time = date.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		if (isToday) {
			return time;
		}
		const dateStr = date.toLocaleDateString([], {
			month: "short",
			day: "numeric",
		});
		return `${dateStr} ${time}`;
	}
}
