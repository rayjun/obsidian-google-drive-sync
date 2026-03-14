# Mobile Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plugin work on mobile by replacing the localhost OAuth flow with an Obsidian protocol handler + GitHub Pages relay page, unified across desktop and mobile.

**Architecture:** Replace Node.js `http`/`crypto` with Web Crypto API and Obsidian's `registerObsidianProtocolHandler`. A static relay page on GitHub Pages receives the Google OAuth callback and redirects to `obsidian://google-drive-sync-callback`. PKCE is added as an extra security layer. OAuth pending state is persisted to disk so it survives page navigation on mobile.

**Tech Stack:** Obsidian Plugin API, Web Crypto API, Google OAuth 2.0 + PKCE, GitHub Pages (static HTML)

---

## Chunk 1: Core Auth Rewrite

### Task 1: Rewrite `google-auth.ts` — Remove Node.js deps, add PKCE

**Files:**
- Modify: `src/google-auth.ts`
- Test: `tests/google-auth.test.ts` (create)

- [ ] **Step 1: Write tests for the new auth functions**

Create `tests/google-auth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	generateOAuthState,
	generateCodeVerifier,
	generateCodeChallenge,
	getAuthUrl,
} from "../src/google-auth";

describe("generateOAuthState", () => {
	it("returns a 32-char hex string", async () => {
		const state = await generateOAuthState();
		expect(state).toMatch(/^[0-9a-f]{32}$/);
	});

	it("returns unique values on successive calls", async () => {
		const a = await generateOAuthState();
		const b = await generateOAuthState();
		expect(a).not.toBe(b);
	});
});

describe("generateCodeVerifier", () => {
	it("returns a base64url string of 43 chars", async () => {
		const verifier = await generateCodeVerifier();
		expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});
});

describe("generateCodeChallenge", () => {
	it("returns a base64url-encoded SHA-256 hash", async () => {
		const verifier = await generateCodeVerifier();
		const challenge = await generateCodeChallenge(verifier);
		expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("produces different challenge for different verifier", async () => {
		const v1 = await generateCodeVerifier();
		const v2 = await generateCodeVerifier();
		const c1 = await generateCodeChallenge(v1);
		const c2 = await generateCodeChallenge(v2);
		expect(c1).not.toBe(c2);
	});
});

describe("getAuthUrl", () => {
	it("includes all required OAuth params including PKCE", () => {
		const url = getAuthUrl("my-client-id", "my-state", "my-challenge");
		expect(url).toContain("client_id=my-client-id");
		expect(url).toContain("state=my-state");
		expect(url).toContain("code_challenge=my-challenge");
		expect(url).toContain("code_challenge_method=S256");
		expect(url).toContain("access_type=offline");
		expect(url).toContain("prompt=consent");
		expect(url).toContain("response_type=code");
		expect(url).toContain("redirect_uri=");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/google-auth.test.ts`
Expected: FAIL — functions not exported or don't exist yet.

- [ ] **Step 3: Rewrite `src/google-auth.ts`**

Replace the entire file with:

```typescript
import { requestUrl } from "obsidian";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REDIRECT_URI = "https://rayjun.github.io/obsidian-google-drive-sync/callback";
const SCOPES = "https://www.googleapis.com/auth/drive.file";

export interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
}

// --- Web Crypto helpers ---

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function toBase64Url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (const b of bytes) {
		binary += String.fromCharCode(b);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function generateOAuthState(): Promise<string> {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return toHex(bytes);
}

export async function generateCodeVerifier(): Promise<string> {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return toBase64Url(bytes.buffer);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return toBase64Url(hash);
}

// --- OAuth URLs ---

export function getAuthUrl(clientId: string, state: string, codeChallenge: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: REDIRECT_URI,
		response_type: "code",
		scope: SCOPES,
		access_type: "offline",
		prompt: "consent",
		state,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
	});
	return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// --- Token exchange ---

function validateTokenResponse(json: Record<string, unknown>): TokenResponse {
	if (json.error) {
		throw new Error(
			`OAuth error: ${(json.error_description as string) ?? json.error}`
		);
	}
	return json as unknown as TokenResponse;
}

export async function exchangeCodeForTokens(
	code: string,
	clientId: string,
	clientSecret: string,
	codeVerifier: string
): Promise<TokenResponse> {
	const response = await requestUrl({
		url: GOOGLE_TOKEN_URL,
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: REDIRECT_URI,
			grant_type: "authorization_code",
			code_verifier: codeVerifier,
		}).toString(),
	});
	return validateTokenResponse(response.json);
}

export async function refreshAccessToken(
	refreshToken: string,
	clientId: string,
	clientSecret: string
): Promise<TokenResponse> {
	const response = await requestUrl({
		url: GOOGLE_TOKEN_URL,
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			refresh_token: refreshToken,
			client_id: clientId,
			client_secret: clientSecret,
			grant_type: "refresh_token",
		}).toString(),
	});
	return validateTokenResponse(response.json);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/google-auth.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Run all existing tests to check for regressions**

Run: `npx vitest run`
Expected: All tests PASS. The sync-engine tests import from `google-auth` but only use `TokenResponse` type — no runtime breakage.

- [ ] **Step 6: Commit**

```bash
git add src/google-auth.ts tests/google-auth.test.ts
git commit -m "feat: rewrite google-auth with Web Crypto API and PKCE, remove Node.js deps"
```

---

### Task 2: Rewrite `main.ts` — Protocol handler + persisted OAuth state

**Files:**
- Modify: `src/main.ts`
- Modify: `tests/__mocks__/obsidian.ts`

- [ ] **Step 1: Update obsidian mock to support `registerObsidianProtocolHandler`**

In `tests/__mocks__/obsidian.ts`, add the method to the Plugin mock:

```typescript
// Minimal Obsidian mock for unit tests
export class Plugin {
	registerObsidianProtocolHandler(_action: string, _handler: (params: any) => void): void {}
}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class Modal {}
export function requestUrl(_options: any): Promise<any> {
	return Promise.resolve({ json: {}, arrayBuffer: new ArrayBuffer(0), headers: {} });
}
```

- [ ] **Step 2: Rewrite `src/main.ts`**

Replace the entire file:

```typescript
import { Notice, Plugin } from "obsidian";
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

interface PendingOAuth {
	state: string;
	codeVerifier: string;
	expiry: number;
}

export default class GoogleDriveSyncPlugin extends Plugin {
	settings: GoogleDriveSyncSettings = DEFAULT_SETTINGS;
	private syncState: SyncState = createEmptySyncState();
	private syncEngine!: SyncEngine;
	private driveApi!: GoogleDriveApi;
	private syncTimerId: number | null = null;
	private statusBarEl: HTMLElement | null = null;
	private saveMutex: Promise<void> = Promise.resolve();
	private pendingOAuth: PendingOAuth | null = null;

	async onload() {
		await this.loadSettings();
		await this.loadSyncState();
		await this.loadPendingOAuth();

		// Register protocol handler for OAuth callback
		this.registerObsidianProtocolHandler(
			"google-drive-sync-callback",
			(params) => this.handleOAuthCallback(params)
		);

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
			const state = await generateOAuthState();
			const codeVerifier = await generateCodeVerifier();
			const codeChallenge = await generateCodeChallenge(codeVerifier);

			// Persist pending OAuth state (survives page navigation on mobile)
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

			new Notice("Redirecting to Google authorization...");
			window.location.href = authUrl;
		} catch (err) {
			console.error("[Google Drive Sync] OAuth error:", err);
			new Notice(`Login failed: ${(err as Error).message}`);
		}
	}

	/**
	 * Handle the OAuth callback from the protocol handler.
	 * Called when Obsidian receives obsidian://google-drive-sync-callback?code=xxx&state=xxx
	 */
	async handleOAuthCallback(params: Record<string, string>): Promise<void> {
		const { code, state, error } = params;

		if (!this.pendingOAuth) {
			new Notice("No pending login. Please try logging in again.");
			return;
		}

		if (Date.now() > this.pendingOAuth.expiry) {
			await this.clearPendingOAuth();
			new Notice("Login timed out. Please try again.");
			return;
		}

		if (state !== this.pendingOAuth.state) {
			await this.clearPendingOAuth();
			new Notice("Login failed: invalid state parameter.");
			return;
		}

		if (error) {
			await this.clearPendingOAuth();
			new Notice(`Login failed: ${error}`);
			return;
		}

		if (!code) {
			await this.clearPendingOAuth();
			new Notice("Login failed: no authorization code received.");
			return;
		}

		try {
			const tokens = await exchangeCodeForTokens(
				code,
				this.settings.clientId,
				this.settings.clientSecret,
				this.pendingOAuth.codeVerifier
			);

			this.settings.accessToken = tokens.access_token;
			this.settings.refreshToken = tokens.refresh_token ?? "";
			this.settings.tokenExpiry = Date.now() + tokens.expires_in * 1000;
			await this.saveSettings();
			await this.clearPendingOAuth();

			new Notice("Successfully logged in to Google Drive!");
			this.startSyncTimer();
		} catch (err) {
			console.error("[Google Drive Sync] Token exchange error:", err);
			await this.clearPendingOAuth();
			new Notice(`Login failed: ${(err as Error).message}`);
		}
	}

	/**
	 * Handle manual auth code paste (fallback when protocol handler doesn't work).
	 */
	async handleManualAuthCode(code: string): Promise<void> {
		if (!this.pendingOAuth) {
			new Notice("No pending login. Please start the login flow first.");
			return;
		}

		if (Date.now() > this.pendingOAuth.expiry) {
			await this.clearPendingOAuth();
			new Notice("Login timed out. Please try again.");
			return;
		}

		try {
			const tokens = await exchangeCodeForTokens(
				code,
				this.settings.clientId,
				this.settings.clientSecret,
				this.pendingOAuth.codeVerifier
			);

			this.settings.accessToken = tokens.access_token;
			this.settings.refreshToken = tokens.refresh_token ?? "";
			this.settings.tokenExpiry = Date.now() + tokens.expires_in * 1000;
			await this.saveSettings();
			await this.clearPendingOAuth();

			new Notice("Successfully logged in to Google Drive!");
			this.startSyncTimer();
		} catch (err) {
			console.error("[Google Drive Sync] Manual auth code error:", err);
			await this.clearPendingOAuth();
			new Notice(`Login failed: ${(err as Error).message}`);
		}
	}

	private async getValidAccessToken(): Promise<string> {
		if (Date.now() < this.settings.tokenExpiry - 60000) {
			return this.settings.accessToken;
		}

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
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts tests/__mocks__/obsidian.ts
git commit -m "feat: replace localhost OAuth with protocol handler, persist pending OAuth state"
```

---

### Task 3: Add manual auth code fallback to settings UI

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Add paste-auth-code input to settings**

In `src/settings.ts`, add after the Authentication setting (after line 95), before the Sync section:

```typescript
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
```

- [ ] **Step 2: Add `hasPendingOAuth()` method to `main.ts`**

Add to the `GoogleDriveSyncPlugin` class in `src/main.ts`:

```typescript
	hasPendingOAuth(): boolean {
		return this.pendingOAuth !== null && Date.now() < this.pendingOAuth.expiry;
	}
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts src/main.ts
git commit -m "feat: add manual auth code paste fallback in settings"
```

---

## Chunk 2: Relay Page, Manifest, Docs

### Task 4: Create the OAuth relay page

**Files:**
- Create: `callback.html`

- [ ] **Step 1: Create `callback.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Google Drive Sync - Authorization</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 20px; text-align: center; color: #333; }
        h1 { font-size: 1.3em; }
        .code-box { background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin: 16px 0; word-break: break-all; font-family: monospace; font-size: 0.9em; user-select: all; }
        .hint { color: #666; font-size: 0.85em; margin-top: 24px; }
        .error { color: #c00; }
    </style>
</head>
<body>
    <h1>Google Drive Sync</h1>
    <div id="status">正在跳转回 Obsidian...</div>
    <div id="fallback" style="display:none;">
        <p>如果没有自动跳转，请复制下方授权码，粘贴到 Obsidian 插件设置中：</p>
        <div class="code-box" id="auth-code"></div>
        <p class="hint">设置 > Google Drive Sync > Paste authorization code</p>
    </div>
    <div id="error-msg" style="display:none;" class="error"></div>
    <script>
        (function() {
            const params = new URLSearchParams(window.location.search);
            const code = params.get("code");
            const state = params.get("state");
            const error = params.get("error");

            if (error) {
                document.getElementById("status").style.display = "none";
                document.getElementById("error-msg").style.display = "block";
                document.getElementById("error-msg").textContent = "Authorization failed: " + error;
                return;
            }

            if (!code) {
                document.getElementById("status").style.display = "none";
                document.getElementById("error-msg").style.display = "block";
                document.getElementById("error-msg").textContent = "No authorization code received.";
                return;
            }

            // Try to redirect back to Obsidian
            var obsidianUrl = "obsidian://google-drive-sync-callback?code=" + encodeURIComponent(code);
            if (state) {
                obsidianUrl += "&state=" + encodeURIComponent(state);
            }
            window.location.href = obsidianUrl;

            // If redirect didn't work after 2 seconds, show fallback
            setTimeout(function() {
                document.getElementById("status").textContent = "自动跳转未成功";
                document.getElementById("auth-code").textContent = code;
                document.getElementById("fallback").style.display = "block";
            }, 2000);
        })();
    </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add callback.html
git commit -m "feat: add OAuth relay page for GitHub Pages"
```

---

### Task 5: Update manifest and README

**Files:**
- Modify: `manifest.json`
- Modify: `README.md`

- [ ] **Step 1: Update `manifest.json`**

Change `isDesktopOnly` from `true` to `false`:

```json
{
	"id": "google-drive-sync",
	"name": "Google Drive Sync",
	"version": "0.1.0",
	"minAppVersion": "0.15.0",
	"description": "Bidirectional sync between your Obsidian vault and Google Drive.",
	"author": "rayjun",
	"isDesktopOnly": false
}
```

- [ ] **Step 2: Update README.md**

Update the "使用前准备" section to reflect the new OAuth setup:

Replace the current section with:

```markdown
## 使用前准备

1. 在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 创建 OAuth 2.0 客户端（**Web 应用**类型）
2. 启用 Google Drive API
3. 在授权重定向 URI 中添加 `https://rayjun.github.io/obsidian-google-drive-sync/callback`

## 配置

1. 打开 Obsidian 设置 > Google Drive Sync
2. 填入 Client ID 和 Client Secret
3. 点击「Login to Google Drive」完成授权
4. 授权成功后自动开始同步

> 支持桌面端和移动端。移动端授权后会自动跳转回 Obsidian，如未自动跳转可手动复制授权码到插件设置中。
```

- [ ] **Step 3: Run all tests to confirm nothing is broken**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add manifest.json README.md
git commit -m "feat: enable mobile support, update docs for new OAuth flow"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Build the plugin**

Run: `npm run build`
Expected: Build succeeds with no errors. The output `main.js` should NOT contain `require("http")` or `require("crypto")`.

- [ ] **Step 3: Verify no Node.js built-in imports remain**

Run: `grep -r "from \"http\"" src/ && grep -r "from \"crypto\"" src/`
Expected: No matches found.

- [ ] **Step 4: Commit any remaining changes**

If all verifications pass, no additional commit needed.
