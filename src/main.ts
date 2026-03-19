import { Notice, Platform, Plugin, setIcon } from "obsidian";
import {
	GoogleDriveSyncSettings,
	DEFAULT_SETTINGS,
	GoogleDriveSyncSettingTab,
} from "./settings";
import {
	getAuthUrl,
	generateOAuthState,
	generateCodeVerifier,
	generateCodeChallenge,
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
import { t, resolveLocale, setLocale } from "./i18n";

interface PendingOAuth {
	state: string;
	codeVerifier: string;
	expiry: number;
}

export interface SyncLogEntry {
	timestamp: number;
	uploaded: number;
	downloaded: number;
	deleted: number;
	errors: number;
	errorMessage?: string;
}

const MAX_SYNC_LOG_ENTRIES = 20;

export default class GoogleDriveSyncPlugin extends Plugin {
	settings: GoogleDriveSyncSettings = DEFAULT_SETTINGS;
	private syncState: SyncState = createEmptySyncState();
	private syncEngine!: SyncEngine;
	private driveApi!: GoogleDriveApi;
	private syncTimerId: number | null = null;
	private statusBarEl: HTMLElement | null = null;
	private ribbonIconEl: HTMLElement | null = null;
	private saveMutex: Promise<void> = Promise.resolve();
	private pendingOAuth: PendingOAuth | null = null;
	syncLog: SyncLogEntry[] = [];

	async onload() {
		await this.loadSettings();
		await this.loadSyncState();
		await this.loadPendingOAuth();
		await this.loadSyncLog();

		// Set locale from settings
		setLocale(resolveLocale(this.settings.language));

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
		this.ribbonIconEl = this.addRibbonIcon("cloud", "Google Drive Sync", async () => {
			await this.runSync();
		});

		// Status bar
		this.statusBarEl = this.addStatusBarItem();
		this.updateStatusBar(t("status.idle"));

		// Commands
		this.addCommand({
			id: "sync-now",
			name: t("command.syncNow"),
			callback: async () => {
				await this.runSync();
			},
		});

		this.addCommand({
			id: "login",
			name: t("command.login"),
			callback: async () => {
				await this.startOAuthFlow();
			},
		});

		this.addCommand({
			id: "logout",
			name: t("command.logout"),
			callback: async () => {
				this.settings.accessToken = "";
				this.settings.refreshToken = "";
				this.settings.tokenExpiry = 0;
				await this.saveSettings();
				new Notice(t("notice.loggedOut"));
			},
		});

		this.addCommand({
			id: "deduplicate",
			name: t("command.deduplicate"),
			callback: async () => {
				await this.runDeduplicate();
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
			new Notice(t("notice.setClientFirst"));
			return;
		}

		try {
			const state = await generateOAuthState();
			const codeVerifier = await generateCodeVerifier();
			const codeChallenge = await generateCodeChallenge(codeVerifier);

			this.pendingOAuth = {
				state,
				codeVerifier,
				expiry: Date.now() + 5 * 60 * 1000,
			};
			await this.savePendingOAuth();

			const authUrl = getAuthUrl(
				this.settings.clientId,
				state,
				codeChallenge
			);

			if (Platform.isMobile) {
				// Mobile: open browser, user copies auth code back manually
				window.open(authUrl);
				new Notice(t("notice.mobileAuth"));
			} else {
				// Desktop: localhost callback server
				const codePromise = listenForAuthCode(state);
				window.open(authUrl);
				new Notice(t("notice.waitingAuth"));
				const code = await codePromise;
				await this.completeOAuth(code);
			}
		} catch (err) {
			console.error("[Google Drive Sync] OAuth error:", err);
			new Notice(
				t("notice.loginFailed", { message: (err as Error).message })
			);
		}
	}

	/**
	 * Complete the OAuth flow by exchanging the authorization code for tokens.
	 */
	private async completeOAuth(code: string): Promise<void> {
		const tokens = await exchangeCodeForTokens(
			code,
			this.settings.clientId,
			this.settings.clientSecret,
			this.pendingOAuth!.codeVerifier
		);

		this.settings.accessToken = tokens.access_token;
		this.settings.refreshToken = tokens.refresh_token ?? "";
		this.settings.tokenExpiry = Date.now() + tokens.expires_in * 1000;
		await this.saveSettings();
		await this.clearPendingOAuth();

		new Notice(t("notice.loginSuccess"));
		this.startSyncTimer();
	}

	/**
	 * Handle manual auth code paste (mobile fallback).
	 */
	async handleManualAuthCode(code: string): Promise<void> {
		if (!this.pendingOAuth) {
			new Notice(t("notice.noPendingLogin"));
			return;
		}

		if (Date.now() > this.pendingOAuth.expiry) {
			await this.clearPendingOAuth();
			new Notice(t("notice.loginTimeout"));
			return;
		}

		try {
			await this.completeOAuth(code);
		} catch (err) {
			console.error("[Google Drive Sync] Manual auth code error:", err);
			await this.clearPendingOAuth();
			new Notice(
				t("notice.loginFailed", { message: (err as Error).message })
			);
		}
	}

	hasPendingOAuth(): boolean {
		return this.pendingOAuth !== null && Date.now() < this.pendingOAuth.expiry;
	}

	private async getValidAccessToken(): Promise<string> {
		if (Date.now() < this.settings.tokenExpiry - 60000) {
			return this.settings.accessToken;
		}

		if (!this.settings.refreshToken) {
			throw new Error(t("notice.noRefreshToken"));
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
			new Notice(t("notice.tokenRefreshFailed"));
			throw err;
		}
	}

	// --- Sync ---

	private async runSync(): Promise<void> {
		if (!this.settings.refreshToken) {
			new Notice(t("notice.pleaseLogin"));
			return;
		}

		this.updateStatusBar(t("status.syncing"));
		this.setRibbonIcon("refresh-cw");

		try {
			const stats = await this.syncEngine.sync();
			const statusMsg = `↑${stats.uploaded} ↓${stats.downloaded}${stats.errors > 0 ? ` ✗${stats.errors}` : ""} · just now`;
			this.updateStatusBar(statusMsg);
			this.setRibbonIcon("cloud");
			this.addSyncLogEntry({
				timestamp: Date.now(),
				uploaded: stats.uploaded,
				downloaded: stats.downloaded,
				deleted: stats.deleted,
				errors: stats.errors,
			});
		} catch (err) {
			console.error("[Google Drive Sync] Sync error:", err);
			this.updateStatusBar(`Error: ${(err as Error).message}`);
			this.setRibbonIcon("cloud-off");
			this.addSyncLogEntry({
				timestamp: Date.now(),
				uploaded: 0,
				downloaded: 0,
				deleted: 0,
				errors: 1,
				errorMessage: (err as Error).message,
			});
		}
	}

	private async runDeduplicate(): Promise<void> {
		if (!this.settings.refreshToken) {
			new Notice(t("notice.pleaseLogin"));
			return;
		}

		new Notice(t("notice.scanning"));

		try {
			const rootFolderId = await this.driveApi.findOrCreateFolder(
				this.settings.driveFolderName
			);
			const deleted = await this.driveApi.deduplicateFiles(rootFolderId);
			if (deleted > 0) {
				new Notice(
					t("notice.removedDuplicates", { count: deleted })
				);
			} else {
				new Notice(t("notice.noDuplicates"));
			}
		} catch (err) {
			console.error("[Google Drive Sync] Deduplicate error:", err);
			new Notice(
				t("notice.deduplicateFailed", {
					message: (err as Error).message,
				})
			);
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
			this.statusBarEl.setText(`${t("status.prefix")}${status}`);
		}
	}

	private setRibbonIcon(iconId: string): void {
		if (this.ribbonIconEl) {
			setIcon(this.ribbonIconEl, iconId);
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

	private async loadSyncLog(): Promise<void> {
		const data = await this.loadData();
		this.syncLog = Array.isArray(data?.syncLog) ? data.syncLog : [];
	}

	private async saveSyncLog(): Promise<void> {
		return this.serializedSave(async (data) => {
			data.syncLog = this.syncLog;
		});
	}

	private addSyncLogEntry(entry: SyncLogEntry): void {
		this.syncLog.unshift(entry);
		if (this.syncLog.length > MAX_SYNC_LOG_ENTRIES) {
			this.syncLog = this.syncLog.slice(0, MAX_SYNC_LOG_ENTRIES);
		}
		this.saveSyncLog();
	}

	private async loadPendingOAuth(): Promise<void> {
		const data = await this.loadData();
		const pending = data?.pendingOAuth as PendingOAuth | undefined;
		if (pending && Date.now() < pending.expiry) {
			this.pendingOAuth = pending;
		} else {
			this.pendingOAuth = null;
		}
	}

	private async savePendingOAuth(): Promise<void> {
		return this.serializedSave(async (data) => {
			data.pendingOAuth = this.pendingOAuth;
		});
	}

	private async clearPendingOAuth(): Promise<void> {
		this.pendingOAuth = null;
		return this.serializedSave(async (data) => {
			delete data.pendingOAuth;
		});
	}

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
