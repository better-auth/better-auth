import { exportJWK, generateKeyPair, generateSecret, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { google, verifyGoogleIdToken } from "./google";

const mockedBetterFetch = vi.mocked(betterFetch);

const CLIENT_ID = "google-client-id";
const CLIENT_SECRET = "google-client-secret";

async function createSignedGoogleToken(
	payload: Record<string, unknown>,
	options: { kid?: string | null } = {},
) {
	const { publicKey, privateKey } = await generateKeyPair("RS256", {
		extractable: true,
	});
	const publicJWK = await exportJWK(publicKey);
	publicJWK.kid = options.kid ?? "test-google-key";
	publicJWK.alg = "RS256";
	publicJWK.use = "sig";
	const protectedHeader =
		options.kid === null
			? ({ alg: "RS256" } as const)
			: ({ alg: "RS256", kid: publicJWK.kid } as const);

	const token = await new SignJWT({
		sub: "google-user-123",
		email: "user@example.com",
		email_verified: true,
		name: "Workspace User",
		picture: "https://example.com/avatar.png",
		...payload,
	})
		.setProtectedHeader(protectedHeader)
		.setIssuer("https://accounts.google.com")
		.setAudience(CLIENT_ID)
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(privateKey);

	return { publicJWK, token };
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

	describe("idToken.verifyClaims", () => {
		it("accepts a token whose hd claim matches the configured hd", () => {
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "example.com",
			});

			expect(provider.idToken?.verifyClaims?.({ hd: "example.com" })).toBe(
				true,
			);
		});

		it("rejects a token whose hd claim does not match", () => {
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "example.com",
			});

			expect(provider.idToken?.verifyClaims?.({ hd: "other.com" })).toBe(false);
		});

		it("rejects a token missing the hd claim when hd is configured", () => {
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "example.com",
			});

			expect(provider.idToken?.verifyClaims?.({})).toBe(false);
		});

		it("accepts any Workspace hd when hd is configured as a wildcard", () => {
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "*",
			});

			expect(provider.idToken?.verifyClaims?.({ hd: "example.com" })).toBe(
				true,
			);
		});

		it("rejects a token missing the hd claim when hd is configured as a wildcard", () => {
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
				hd: "*",
			});

			expect(provider.idToken?.verifyClaims?.({})).toBe(false);
		});

		it("does not define an hd claim verifier when hd is not configured", () => {
			const provider = google({
				clientId: CLIENT_ID,
				clientSecret: CLIENT_SECRET,
			});

			expect(provider.idToken?.verifyClaims).toBeUndefined();
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

describe("verifyGoogleIdToken", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("verifies an id token without requiring a kid header", async () => {
		const { publicJWK, token } = await createSignedGoogleToken(
			{},
			{ kid: null },
		);
		mockedBetterFetch.mockResolvedValueOnce({
			data: { keys: [publicJWK] },
		} as never);

		const payload = await verifyGoogleIdToken({
			token,
			audience: CLIENT_ID,
		});

		expect(payload?.sub).toBe("google-user-123");
	});

	it("rejects tokens signed with symmetric algorithms before fetching Google keys", async () => {
		const secret = await generateSecret("HS256");
		const token = await new SignJWT({
			sub: "google-user-123",
			email: "user@example.com",
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer("https://accounts.google.com")
			.setAudience(CLIENT_ID)
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(secret);

		const payload = await verifyGoogleIdToken({
			token,
			audience: CLIENT_ID,
		});

		expect(payload).toBeNull();
		expect(mockedBetterFetch).not.toHaveBeenCalled();
	});
});
