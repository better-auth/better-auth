import type { AuthContext } from "@better-auth/core";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { symmetricEncrypt } from "../crypto";
import { genericOAuth } from "../plugins/generic-oauth";
import { decryptOAuthToken, getOAuthCallbackPath, setTokenUtil } from "./utils";

describe("getOAuthCallbackPath", () => {
	it("preserves a registered generic OAuth redirect URI including its slash boundary", async () => {
		const { auth } = await getTestInstance({
			baseURL: "http://LOCALHOST:3000/api/auth/",
			plugins: [
				genericOAuth({
					config: [
						{
							providerId: "acme:prod",
							clientId: "client-id",
							clientSecret: "client-secret",
							authorizationUrl: "https://idp.example.com/authorize",
							tokenUrl: "https://idp.example.com/token",
							userInfoUrl: "https://idp.example.com/userinfo",
						},
					],
				}),
			],
		});
		const result = await auth.api.signInSocial({
			body: {
				provider: "acme:prod",
				callbackURL: "/dashboard",
				disableRedirect: true,
			},
		});
		expect(new URL(result.url!).searchParams.get("redirect_uri")).toBe(
			"http://LOCALHOST:3000/api/auth//callback/acme:prod",
		);
	});

	it.each([
		"acme:prod",
		"okta@corp",
		"a+b",
		"team%2Fmember",
		"okta%3Aacme",
	])("preserves a registered callback path for provider %s", (id) => {
		expect(getOAuthCallbackPath({ id })).toBe(`/callback/${id}`);
	});

	it("keeps a custom callback path as a path", () => {
		expect(
			getOAuthCallbackPath({
				id: "team/member",
				callbackPath: "/callback/custom/provider",
			}),
		).toBe("/callback/custom/provider");
	});
});

/**
 * @see https://url.spec.whatwg.org/#percent-encoded-bytes
 */
describe("OAuth callback provider identity", () => {
	it.each([
		"okta:acme",
		"okta@corp",
		"a+b",
		"a,;=$&b",
		"team%2Fmember",
		"team%252Fmember",
		"okta%3Aacme",
		"a%zz",
	])("preserves the configured provider identity through the callback: %s", async (providerId) => {
		const { auth } = await getTestInstance({
			plugins: [
				genericOAuth({
					config: [
						{
							providerId,
							clientId: "client-id",
							clientSecret: "client-secret",
							authorizationUrl: "https://idp.example.com/authorize",
							tokenUrl: "https://idp.example.com/token",
							userInfoUrl: "https://idp.example.com/userinfo",
						},
					],
				}),
			],
		});
		const context = await auth.$context;
		const provider = context.socialProviders.find(
			(entry) => entry.id === providerId,
		);
		expect.assert(provider);
		const exchange = vi
			.spyOn(provider, "validateAuthorizationCode")
			.mockResolvedValue(null);
		const start = await auth.api.signInSocial({
			body: {
				provider: providerId,
				callbackURL: "/dashboard",
				disableRedirect: true,
			},
			asResponse: true,
		});
		const data = (await start.json()) as { url: string };
		const authorization = new URL(data.url);
		const state = authorization.searchParams.get("state");
		const redirectURI = authorization.searchParams.get("redirect_uri");
		expect.assert(state);
		expect.assert(redirectURI);
		expect(redirectURI).toBe(
			`http://localhost:3000/api/auth/callback/${providerId}`,
		);
		const callback = new URL(redirectURI);
		callback.searchParams.set("state", state);
		callback.searchParams.set("code", "callback-code");
		const cookie = start.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		const response = await auth.handler(
			new Request(callback, { headers: { cookie } }),
		);
		expect(exchange).toHaveBeenCalledOnce();
		expect(response.headers.get("location")).not.toContain(
			"provider_not_found",
		);
	});

	it("preserves an encoded callback pathname when redirecting POST to GET", async () => {
		const { auth } = await getTestInstance();
		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/callback/okta%3Aacme", {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					code: "callback-code",
					state: "callback-state",
				}),
			}),
		);
		const location = response.headers.get("location");
		expect.assert(location);
		expect(new URL(location).pathname).toBe("/api/auth/callback/okta%3Aacme");
	});
});

// Mock minimal AuthContext for testing
function createMockContext(encryptOAuthTokens: boolean): AuthContext {
	return {
		secret: "test-secret-key-for-encryption",
		secretConfig: "test-secret-key-for-encryption",
		options: {
			account: {
				encryptOAuthTokens,
			},
		},
	} as unknown as AuthContext;
}

describe("decryptOAuthToken", () => {
	it("should return empty token as-is", async () => {
		const ctx = createMockContext(true);
		const result = await decryptOAuthToken("", ctx);
		expect(result).toBe("");
	});

	it("should return token as-is when encryption is disabled", async () => {
		const ctx = createMockContext(false);
		const plainToken = "ya29.a0ARW5m7hQ_some_oauth_token";
		const result = await decryptOAuthToken(plainToken, ctx);
		expect(result).toBe(plainToken);
	});

	it("should decrypt encrypted token when encryption is enabled", async () => {
		const ctx = createMockContext(true);
		const originalToken = "test-access-token";

		// Encrypt the token first
		const encryptedToken = await symmetricEncrypt({
			key: ctx.secret,
			data: originalToken,
		});

		// Decrypt should return original
		const result = await decryptOAuthToken(encryptedToken, ctx);
		expect(result).toBe(originalToken);
	});

	it("should handle migration: return unencrypted token as-is when encryption is enabled", async () => {
		const ctx = createMockContext(true);

		// Simulate a token that was stored before encryption was enabled
		// OAuth tokens typically contain dots, underscores, hyphens - not valid hex
		const plainOAuthToken = "ya29.a0ARW5m7hQ_some_oauth_token_with-dashes";

		// This should NOT throw, and should return the token as-is
		const result = await decryptOAuthToken(plainOAuthToken, ctx);
		expect(result).toBe(plainOAuthToken);
	});

	it("should handle migration: JWT-style tokens should be returned as-is", async () => {
		const ctx = createMockContext(true);

		// JWT tokens contain dots which are not valid hex characters
		const jwtToken =
			"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature";

		const result = await decryptOAuthToken(jwtToken, ctx);
		expect(result).toBe(jwtToken);
	});

	it("should handle migration: token with odd length should be returned as-is", async () => {
		const ctx = createMockContext(true);

		// Odd length hex-like string cannot be valid encrypted data
		const oddLengthToken = "abc";

		const result = await decryptOAuthToken(oddLengthToken, ctx);
		expect(result).toBe(oddLengthToken);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/6018
 */
describe("migration scenario - issue #6018", () => {
	it("should handle Google OAuth token stored before encryption was enabled", async () => {
		// Simulate the exact bug scenario from issue #6018:
		// 1. User logs in with Google OAuth when encryptOAuthTokens: false
		// 2. Access token stored as plain text: "ya29.a0ARW5m7..."
		// 3. User enables encryptOAuthTokens: true
		// 4. Access token expires, system tries to decrypt the plain text token
		// 5. Previously: "hex string expected, got unpadded hex of length 253" /* cspell:disable-line */
		// 6. Now: should return the token as-is

		const ctx = createMockContext(true); // encryption now enabled

		// Real-world Google OAuth access token format (contains non-hex chars)
		const googleAccessToken =
			"ya29.a0ARW5m7hQ_test-token_with.dots-and_underscores";

		// This should NOT throw "hex string expected, got unpadded hex of length X" /* cspell:disable-line */
		const result = await decryptOAuthToken(googleAccessToken, ctx);
		expect(result).toBe(googleAccessToken);
	});

	it("should handle refresh token that was stored unencrypted", async () => {
		const ctx = createMockContext(true);

		// Google refresh tokens have this format
		const googleRefreshToken =
			"1//0gxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // cspell:disable-line

		const result = await decryptOAuthToken(googleRefreshToken, ctx);
		expect(result).toBe(googleRefreshToken);
	});

	it("should still decrypt properly encrypted tokens", async () => {
		const ctx = createMockContext(true);
		const originalToken = "ya29.newToken_after_encryption_enabled";

		// Simulate a token that was stored AFTER encryption was enabled
		const encryptedToken = await setTokenUtil(originalToken, ctx);

		// Should decrypt correctly
		const result = await decryptOAuthToken(encryptedToken as string, ctx);
		expect(result).toBe(originalToken);
	});
});

describe("setTokenUtil", () => {
	it("should return null/undefined as-is", async () => {
		const ctx = createMockContext(true);
		expect(await setTokenUtil(null, ctx)).toBe(null);
		expect(await setTokenUtil(undefined, ctx)).toBe(undefined);
	});

	it("should return token as-is when encryption is disabled", async () => {
		const ctx = createMockContext(false);
		const token = "test-token";
		const result = await setTokenUtil(token, ctx);
		expect(result).toBe(token);
	});

	it("should encrypt token when encryption is enabled", async () => {
		const ctx = createMockContext(true);
		const token = "test-token";
		const result = await setTokenUtil(token, ctx);

		// Result should be hex-encoded encrypted data
		expect(result).not.toBe(token);
		expect(result).toMatch(/^[0-9a-f]+$/i);
		expect((result as string).length % 2).toBe(0);
	});

	it("should produce tokens that can be decrypted", async () => {
		const ctx = createMockContext(true);
		const originalToken = "my-secret-access-token";

		const encrypted = await setTokenUtil(originalToken, ctx);
		const decrypted = await decryptOAuthToken(encrypted as string, ctx);

		expect(decrypted).toBe(originalToken);
	});
});
