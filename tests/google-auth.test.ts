import { describe, it, expect } from "vitest";
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
