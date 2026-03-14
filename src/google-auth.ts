import { requestUrl } from "obsidian";
import http from "http";
import crypto from "crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REDIRECT_PORT = 42813;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const SCOPES = "https://www.googleapis.com/auth/drive.file";

export interface TokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
}

export function getAuthUrl(clientId: string, state: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: REDIRECT_URI,
		response_type: "code",
		scope: SCOPES,
		access_type: "offline",
		prompt: "consent",
		state,
	});
	return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function generateOAuthState(): string {
	return crypto.randomBytes(16).toString("hex");
}

/**
 * Start a local HTTP server, open the browser for OAuth,
 * and return the authorization code.
 * Verifies the state parameter to prevent CSRF attacks.
 */
export function listenForAuthCode(expectedState: string): Promise<string> {
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
					"<html><body><h1>Authorization failed</h1><p>Invalid state parameter (possible CSRF attack).</p></body></html>"
				);
				server.close();
				settle(() =>
					reject(new Error("OAuth state mismatch — possible CSRF attack"))
				);
				return;
			}

			if (code) {
				res.end(
					"<html><body><h1>Authorization successful!</h1><p>You can close this window.</p></body></html>"
				);
				server.close();
				settle(() => resolve(code));
			} else {
				res.end(
					`<html><body><h1>Authorization failed</h1><p>${error ?? "Unknown error"}</p></body></html>`
				);
				server.close();
				settle(() =>
					reject(new Error(error ?? "No authorization code received"))
				);
			}
		});

		server.listen(REDIRECT_PORT, "127.0.0.1", () => {
			// Server ready, bound to localhost only
		});

		server.on("error", (err) => {
			settle(() =>
				reject(
					new Error(
						`Failed to start OAuth callback server: ${err.message}`
					)
				)
			);
		});

		// Timeout after 5 minutes
		const timeoutId = setTimeout(() => {
			server.close();
			settle(() => reject(new Error("OAuth authorization timed out")));
		}, 5 * 60 * 1000);
	});
}

/**
 * Validate a token response from Google and throw on errors.
 */
function validateTokenResponse(json: Record<string, unknown>): TokenResponse {
	if (json.error) {
		throw new Error(
			`OAuth error: ${(json.error_description as string) ?? json.error}`
		);
	}
	return json as unknown as TokenResponse;
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(
	code: string,
	clientId: string,
	clientSecret: string
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
		}).toString(),
	});
	return validateTokenResponse(response.json);
}

/**
 * Refresh an expired access token.
 */
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
