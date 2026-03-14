import { Notice, Plugin } from "obsidian";
import {
	GoogleDriveSyncSettings,
	DEFAULT_SETTINGS,
	GoogleDriveSyncSettingTab,
} from "./settings";
import {
	getAuthUrl,
	generateOAuthState,
	listenForAuthCode,
	exchangeCodeForTokens,
	refreshAccessToken,
} from "./google-auth";
import { GoogleDriveApi } from "./google-drive-api";
import { SyncEngine } from "./sync-engine";
import {
	SyncState,
	createEmptySyncState,
	isStateOutdated,
} from "./sync-state";

export default class GoogleDriveSyncPlugin extends Plugin {
	settings: GoogleDriveSyncSettings = DEFAULT_SETTINGS;
	private syncState: SyncState = createEmptySyncState();
	private syncEngine!: SyncEngine;
	private driveApi!: GoogleDriveApi;
	private syncTimerId: number | null = null;
	private statusBarEl: HTMLElement | null = null;
	private saveMutex: Promise<void> = Promise.resolve();

	async onload() {
		await this.loadSettings();
		await this.loadSyncState();

		// Initialize Drive API with token provider
		this.driveApi = new GoogleDriveApi(() => this.getValidAccessToken());

		// Initialize sync engine
		this.syncEngine = new SyncEngine(
			this.app.vault,
			this.driveApi,
			() => ({
				driveFolderName: this.settings.driveFolderName,
				excludePatterns: this.settings.excludePatterns,
			}),
			() => this.syncState,
			async (state) => {
				this.syncState = state;
				await this.saveSyncState();
			}
		);

		// Ribbon icon
		this.addRibbonIcon("cloud", "Google Drive Sync", async () => {
			await this.runSync();
		});

		// Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.updateStatusBar("Idle");

		// Commands
		this.addCommand({
			id: "sync-now",
			name: "Sync now",
			callback: async () => {
				await this.runSync();
			},
		});

		this.addCommand({
			id: "login",
			name: "Login to Google Drive",
			callback: async () => {
				await this.startOAuthFlow();
			},
		});

		this.addCommand({
			id: "logout",
			name: "Logout",
			callback: async () => {
				this.settings.accessToken = "";
				this.settings.refreshToken = "";
				this.settings.tokenExpiry = 0;
				await this.saveSettings();
				new Notice("Logged out of Google Drive.");
			},
		});

		// Settings tab
		this.addSettingTab(new GoogleDriveSyncSettingTab(this.app, this));

		// Start auto-sync timer if logged in
		if (this.settings.refreshToken) {
			this.startSyncTimer();
		}
	}

	onunload() {
		this.stopSyncTimer();
	}

	// --- OAuth ---

	async startOAuthFlow(): Promise<void> {
		if (!this.settings.clientId || !this.settings.clientSecret) {
			new Notice(
				"Please set Client ID and Client Secret in settings first."
			);
			return;
		}

		try {
			const state = generateOAuthState();
			const authUrl = getAuthUrl(this.settings.clientId, state);
			const codePromise = listenForAuthCode(state);
			window.open(authUrl);

			new Notice("Waiting for Google authorization...");
			const code = await codePromise;

			const tokens = await exchangeCodeForTokens(
				code,
				this.settings.clientId,
				this.settings.clientSecret
			);

			this.settings.accessToken = tokens.access_token;
			this.settings.refreshToken = tokens.refresh_token ?? "";
			this.settings.tokenExpiry = Date.now() + tokens.expires_in * 1000;
			await this.saveSettings();

			new Notice("Successfully logged in to Google Drive!");
			this.startSyncTimer();
		} catch (err) {
			console.error("[Google Drive Sync] OAuth error:", err);
			new Notice(`Login failed: ${(err as Error).message}`);
		}
	}

	private async getValidAccessToken(): Promise<string> {
		if (Date.now() < this.settings.tokenExpiry - 60000) {
			return this.settings.accessToken;
		}

		// Token expired or about to expire — refresh
		if (!this.settings.refreshToken) {
			throw new Error("No refresh token. Please log in again.");
		}

		try {
			const tokens = await refreshAccessToken(
				this.settings.refreshToken,
				this.settings.clientId,
				this.settings.clientSecret
			);

			this.settings.accessToken = tokens.access_token;
			this.settings.tokenExpiry = Date.now() + tokens.expires_in * 1000;
			if (tokens.refresh_token) {
				this.settings.refreshToken = tokens.refresh_token;
			}
			await this.saveSettings();
			return this.settings.accessToken;
		} catch (err) {
			console.error("[Google Drive Sync] Token refresh failed:", err);
			new Notice(
				"Google Drive token refresh failed. Please log in again."
			);
			throw err;
		}
	}

	// --- Sync ---

	private async runSync(): Promise<void> {
		if (!this.settings.refreshToken) {
			new Notice("Please log in to Google Drive first.");
			return;
		}

		this.updateStatusBar("Syncing...");

		try {
			const stats = await this.syncEngine.sync();
			const msg = `Google Drive sync complete (${stats.uploaded} uploaded, ${stats.downloaded} downloaded${stats.errors > 0 ? `, ${stats.errors} errors` : ""})`;
			new Notice(msg);
			this.updateStatusBar("Last sync: just now");
		} catch (err) {
			console.error("[Google Drive Sync] Sync error:", err);
			new Notice(`Google Drive sync failed: ${(err as Error).message}`);
			this.updateStatusBar("Error");
		}
	}

	// --- Timer ---

	startSyncTimer(): void {
		this.stopSyncTimer();
		const intervalMs = this.settings.syncInterval * 60 * 1000;
		this.syncTimerId = window.setInterval(() => {
			this.runSync();
		}, intervalMs);
		this.registerInterval(this.syncTimerId);
	}

	private stopSyncTimer(): void {
		if (this.syncTimerId !== null) {
			window.clearInterval(this.syncTimerId);
			this.syncTimerId = null;
		}
	}

	resetSyncTimer(): void {
		if (this.settings.refreshToken) {
			this.startSyncTimer();
		}
	}

	// --- Status Bar ---

	private updateStatusBar(status: string): void {
		if (this.statusBarEl) {
			this.statusBarEl.setText(`Google Drive: ${status}`);
		}
	}

	// --- Settings & State persistence ---

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
	}

	async saveSettings(): Promise<void> {
		return this.serializedSave(async (data) => {
			data.settings = this.settings;
		});
	}

	private async loadSyncState(): Promise<void> {
		const data = await this.loadData();
		const saved = data?.syncState;
		if (saved && !isStateOutdated(saved)) {
			this.syncState = saved;
		} else {
			this.syncState = createEmptySyncState();
		}
	}

	private async saveSyncState(): Promise<void> {
		return this.serializedSave(async (data) => {
			data.syncState = this.syncState;
		});
	}

	/**
	 * Serialize all save operations to prevent read-modify-write races.
	 */
	private serializedSave(
		mutate: (data: Record<string, unknown>) => Promise<void> | void
	): Promise<void> {
		this.saveMutex = this.saveMutex.then(async () => {
			const data = (await this.loadData()) ?? {};
			await mutate(data);
			await this.saveData(data);
		});
		return this.saveMutex;
	}
}
