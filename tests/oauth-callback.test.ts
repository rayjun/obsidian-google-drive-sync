import { describe, it, expect, vi, beforeEach } from "vitest";

import { Notice } from "obsidian";

vi.mock("obsidian", () => ({
	Plugin: class {},
	Notice: vi.fn(),
	PluginSettingTab: class {},
	Setting: class {},
	Platform: { isMobile: false, isDesktop: true },
	requestUrl: vi.fn(),
}));

const { default: GoogleDriveSyncPlugin } = await import("../src/main");

function createPlugin(pendingOAuth: { state: string; codeVerifier: string; expiry: number } | null = null): any {
	const plugin = Object.create(GoogleDriveSyncPlugin.prototype);
	plugin.settings = {
		clientId: "test-client-id",
		clientSecret: "test-secret",
		accessToken: "",
		refreshToken: "",
		tokenExpiry: 0,
		syncInterval: 5,
		driveFolderName: "Vault",
		excludePatterns: [],
	};
	// @ts-ignore - accessing private field for testing
	plugin.pendingOAuth = pendingOAuth;
	plugin.saveMutex = Promise.resolve();

	plugin.loadData = vi.fn(async () => ({}));
	plugin.saveData = vi.fn(async () => {});
	plugin.saveSettings = vi.fn(async () => {});
	plugin.startSyncTimer = vi.fn();

	return plugin;
}

describe("handleManualAuthCode", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns early when no pending OAuth flow", async () => {
		const plugin = createPlugin(null);
		await plugin.handleManualAuthCode("some-code");
		expect(Notice).toHaveBeenCalledWith("No pending login. Please start the login flow first.");
	});

	it("rejects expired OAuth flow", async () => {
		const plugin = createPlugin({
			state: "my-state",
			codeVerifier: "my-verifier",
			expiry: Date.now() - 1000,
		});
		await plugin.handleManualAuthCode("some-code");
		expect(Notice).toHaveBeenCalledWith("Login timed out. Please try again.");
	});
});

describe("hasPendingOAuth", () => {
	it("returns false when no pending OAuth", () => {
		const plugin = createPlugin(null);
		expect(plugin.hasPendingOAuth()).toBe(false);
	});

	it("returns true when pending OAuth is valid", () => {
		const plugin = createPlugin({
			state: "s",
			codeVerifier: "v",
			expiry: Date.now() + 300000,
		});
		expect(plugin.hasPendingOAuth()).toBe(true);
	});

	it("returns false when pending OAuth is expired", () => {
		const plugin = createPlugin({
			state: "s",
			codeVerifier: "v",
			expiry: Date.now() - 1000,
		});
		expect(plugin.hasPendingOAuth()).toBe(false);
	});
});
