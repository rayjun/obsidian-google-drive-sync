import { Platform, requestUrl } from "obsidian";
import { t } from "./i18n";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REDIRECT_PORT = 42813;
const LOCALHOST_REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = "https://www.googleapis.com/auth/drive";

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
	const hash = await crypto.subtle.digest("SHA-256", data as unknown as BufferSource);
	return toBase64Url(hash);
}

// --- OAuth URLs ---

export function getAuthUrl(clientId: string, state: string, codeChallenge: string, redirectUri?: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: redirectUri ?? LOCALHOST_REDIRECT_URI,
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

// --- Desktop: localhost callback server ---

export function listenForAuthCode(expectedState: string): Promise<string> {
	// Only available on desktop — mobile should use manual auth code paste
	if (Platform.isMobile) {
		return Promise.reject(new Error("localhost OAuth callback is not available on mobile"));
	}

	// Dynamic import — only works on desktop (Node.js)
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const http = require("http") as typeof import("http");

	return new Promise((resolve, reject) => {
		let settled = false;

		const settle = (fn: () => void) => {
			if (!settled) {
				settled = true;
				clearTimeout(timeoutId);
				fn();
			}
		};

		const server = http.createServer((req, res) => {
			const url = new URL(req.url ?? "", `http://localhost:${REDIRECT_PORT}`);

			if (url.pathname !== "/callback") {
				res.writeHead(404, { "Content-Type": "text/plain" });
				res.end("Not found");
				return;
			}

			const code = url.searchParams.get("code");
			const error = url.searchParams.get("error");
			const state = url.searchParams.get("state");

			res.writeHead(200, { "Content-Type": "text/html" });

			if (state !== expectedState) {
				res.end(
					`<html><body><h1>${t("auth.failedTitle")}</h1><p>${t("auth.invalidState")}</p></body></html>`
				);
				server.close();
				settle(() =>
					reject(new Error("OAuth state mismatch — possible CSRF attack"))
				);
				return;
			}

			if (code) {
				res.end(
					`<html><body><h1>${t("auth.successTitle")}</h1><p>${t("auth.successBody")}</p></body></html>`
				);
				server.close();
				settle(() => resolve(code));
			} else {
				res.end(
					`<html><body><h1>${t("auth.failedTitle")}</h1><p>${error ?? "Unknown error"}</p></body></html>`
				);
				server.close();
				settle(() =>
					reject(new Error(error ?? "No authorization code received"))
				);
			}
		});

		server.listen(REDIRECT_PORT, "127.0.0.1", () => {
			// Server ready
		});

		server.on("error", (err: Error) => {
			settle(() =>
				reject(
					new Error(
						`Failed to start OAuth callback server: ${err.message}`
					)
				)
			);
		});

		const timeoutId = setTimeout(() => {
			server.close();
			settle(() => reject(new Error("OAuth authorization timed out")));
		}, 5 * 60 * 1000);
	});
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
	codeVerifier: string,
	redirectUri?: string
): Promise<TokenResponse> {
	const response = await requestUrl({
		url: GOOGLE_TOKEN_URL,
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri ?? LOCALHOST_REDIRECT_URI,
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
