import type { AuthContext } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { symmetricEncrypt } from "../crypto";
import { decryptOAuthToken, setTokenUtil } from "./utils";

// Mock minimal AuthContext for testing
function createMockContext(encryptOAuthTokens: boolean): AuthContext {
	return {
		secret: "test-secret-key-for-encryption",
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

describe("migration scenario - issue #6018", () => {
	it("should handle Google OAuth token stored before encryption was enabled", async () => {
		// Simulate the exact bug scenario from issue #6018:
		// 1. User logs in with Google OAuth when encryptOAuthTokens: false
		// 2. Access token stored as plain text: "ya29.a0ARW5m7..."
		// 3. User enables encryptOAuthTokens: true
		// 4. Access token expires, system tries to decrypt the plain text token
		// 5. Previously: "hex string expected, got unpadded hex of length 253"
		// 6. Now: should return the token as-is

		const ctx = createMockContext(true); // encryption now enabled

		// Real-world Google OAuth access token format (contains non-hex chars)
		const googleAccessToken =
			"ya29.a0ARW5m7hQ_test-token_with.dots-and_underscores";

		// This should NOT throw "hex string expected, got unpadded hex of length X"
		const result = await decryptOAuthToken(googleAccessToken, ctx);
		expect(result).toBe(googleAccessToken);
	});

	it("should handle refresh token that was stored unencrypted", async () => {
		const ctx = createMockContext(true);

		// Google refresh tokens have this format
		const googleRefreshToken =
			"1//0gxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

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
