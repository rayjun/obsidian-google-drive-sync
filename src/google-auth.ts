import { requestUrl } from "obsidian";
import http from "http";

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

export function getAuthUrl(clientId: string): string {
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: REDIRECT_URI,
		response_type: "code",
		scope: SCOPES,
		access_type: "offline",
		prompt: "consent",
	});
	return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Start a local HTTP server, open the browser for OAuth,
 * and return the authorization code.
 */
export function listenForAuthCode(): Promise<string> {
	return new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
			const url = new URL(req.url ?? "", `http://localhost:${REDIRECT_PORT}`);
			if (url.pathname === "/callback") {
				const code = url.searchParams.get("code");
				const error = url.searchParams.get("error");

				res.writeHead(200, { "Content-Type": "text/html" });
				if (code) {
					res.end(
						"<html><body><h1>Authorization successful!</h1><p>You can close this window.</p></body></html>"
					);
					server.close();
					resolve(code);
				} else {
					res.end(
						`<html><body><h1>Authorization failed</h1><p>${error ?? "Unknown error"}</p></body></html>`
					);
					server.close();
					reject(new Error(error ?? "No authorization code received"));
				}
			}
		});

		server.listen(REDIRECT_PORT, () => {
			// Server ready
		});

		server.on("error", (err) => {
			reject(
				new Error(`Failed to start OAuth callback server: ${err.message}`)
			);
		});

		// Timeout after 5 minutes
		setTimeout(() => {
			server.close();
			reject(new Error("OAuth authorization timed out"));
		}, 5 * 60 * 1000);
	});
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
	return response.json as TokenResponse;
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
	return response.json as TokenResponse;
}
