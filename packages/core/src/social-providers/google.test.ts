import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { google } from "./google";

const mockedBetterFetch = vi.mocked(betterFetch);

const CLIENT_ID = "google-client-id";
const CLIENT_SECRET = "google-client-secret";

async function createSignedGoogleToken(payload: Record<string, unknown>) {
	const { publicKey, privateKey } = await generateKeyPair("RS256", {
		extractable: true,
	});
	const publicJWK = await exportJWK(publicKey);
	publicJWK.kid = "test-google-key";
	publicJWK.alg = "RS256";
	publicJWK.use = "sig";

	const token = await new SignJWT({
		sub: "google-user-123",
		email: "user@example.com",
		email_verified: true,
		name: "Workspace User",
		picture: "https://example.com/avatar.png",
		...payload,
	})
		.setProtectedHeader({ alg: "RS256", kid: "test-google-key" })
		.setIssuer("https://accounts.google.com")
		.setAudience(CLIENT_ID)
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(privateKey);

	return { publicJWK, token };
}

function mockGoogleJwks(publicJWK: JWK) {
	mockedBetterFetch.mockResolvedValueOnce({
		data: { keys: [publicJWK] },
		error: null,
	} as Awaited<ReturnType<typeof betterFetch>>);
}

// decodeJwt (used by getUserInfo) does not verify the signature, so a plain
// encoded JWT is enough for the profile path.
async function encodeGoogleToken(payload: Record<string, unknown>) {
	const { token } = await createSignedGoogleToken(payload);
	return token;
}

describe("google hosted domain (hd) enforcement", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	describe("verifyIdToken", () => {
		it("accepts a token whose hd claim matches the configured hd", async () => {
			const { publicJWK, token } = await createSignedGoogleToken({
				hd: "example.com",
			});
			mockGoogleJwks(publicJWK);

			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "example.com",
			});

			await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(
				true,
			);
		});

		it("rejects a token whose hd claim does not match", async () => {
			const { publicJWK, token } = await createSignedGoogleToken({
				hd: "other.com",
			});
			mockGoogleJwks(publicJWK);

			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "example.com",
			});

			await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(
				false,
			);
		});

		it("rejects a token missing the hd claim when hd is configured", async () => {
			const { publicJWK, token } = await createSignedGoogleToken({});
			mockGoogleJwks(publicJWK);

			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "example.com",
			});

			await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(
				false,
			);
		});

		it("accepts any Workspace hd when hd is configured as a wildcard", async () => {
			const { publicJWK, token } = await createSignedGoogleToken({
				hd: "example.com",
			});
			mockGoogleJwks(publicJWK);

			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "*",
			});

			await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(
				true,
			);
		});

		it("rejects a token missing the hd claim when hd is configured as a wildcard", async () => {
			const { publicJWK, token } = await createSignedGoogleToken({});
			mockGoogleJwks(publicJWK);

			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "*",
			});

			await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(
				false,
			);
		});

		it("does not require an hd claim when hd is not configured", async () => {
			const { publicJWK, token } = await createSignedGoogleToken({});
			mockGoogleJwks(publicJWK);

			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
			});

			await expect(provider.verifyIdToken(token, undefined)).resolves.toBe(
				true,
			);
		});
	});

	describe("getUserInfo", () => {
		it("returns the user when the hd claim matches", async () => {
			const idToken = await encodeGoogleToken({ hd: "example.com" });
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "example.com",
			});

			const result = await provider.getUserInfo({
				idToken,
				accessToken: "access",
			});
			expect(result?.user.email).toBe("user@example.com");
		});

		it("returns null when the hd claim does not match", async () => {
			const idToken = await encodeGoogleToken({ hd: "other.com" });
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "example.com",
			});

			const result = await provider.getUserInfo({
				idToken,
				accessToken: "access",
			});
			expect(result).toBeNull();
		});

		it("returns null when the hd claim is missing and hd is configured", async () => {
			const idToken = await encodeGoogleToken({});
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "example.com",
			});

			const result = await provider.getUserInfo({
				idToken,
				accessToken: "access",
			});
			expect(result).toBeNull();
		});

		it("returns the user for any Workspace hd when hd is configured as a wildcard", async () => {
			const idToken = await encodeGoogleToken({ hd: "example.com" });
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "*",
			});

			const result = await provider.getUserInfo({
				idToken,
				accessToken: "access",
			});
			expect(result?.user.email).toBe("user@example.com");
		});

		it("returns null when the hd claim is missing and hd is configured as a wildcard", async () => {
			const idToken = await encodeGoogleToken({});
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "*",
			});

			const result = await provider.getUserInfo({
				idToken,
				accessToken: "access",
			});
			expect(result).toBeNull();
		});

		it("returns the user regardless of hd when hd is not configured", async () => {
			const idToken = await encodeGoogleToken({ hd: "anything.com" });
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
			});

			const result = await provider.getUserInfo({
				idToken,
				accessToken: "access",
			});
			expect(result?.user.email).toBe("user@example.com");
		});
	});
});
