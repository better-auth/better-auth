import { createHash } from "node:crypto";

import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenericEndpointContext } from "../types";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

import { apple } from "./apple";

const mockedBetterFetch = vi.mocked(betterFetch);

async function createSignedAppleToken(payloadNonce: string) {
	const { publicKey, privateKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	const publicJWK = await exportJWK(publicKey);
	publicJWK.kid = "test-apple-key";
	publicJWK.alg = "ES256";
	publicJWK.use = "sig";

	const token = await new SignJWT({
		sub: "apple-user-123",
		email: "user@example.com",
		email_verified: true,
		nonce: payloadNonce,
	})
		.setProtectedHeader({ alg: "ES256", kid: "test-apple-key" })
		.setIssuer("https://appleid.apple.com")
		.setAudience("com.example.app")
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(privateKey);

	return { publicJWK, token };
}

function mockAppleJwks(publicJWK: JWK) {
	mockedBetterFetch.mockResolvedValueOnce({
		data: { keys: [publicJWK] },
		error: null,
	} as Awaited<ReturnType<typeof betterFetch>>);
}

describe("apple.verifyIdToken", () => {
	beforeEach(() => {
		mockedBetterFetch.mockReset();
	});

	it("accepts a matching raw nonce", async () => {
		const rawNonce = "raw-nonce";
		const { publicJWK, token } = await createSignedAppleToken(rawNonce);
		mockAppleJwks(publicJWK);

		const provider = apple({
			clientId: "service.example.app",
			clientSecret: "test-secret",
			appBundleIdentifier: "com.example.app",
		});

		await expect(provider.verifyIdToken(token, rawNonce)).resolves.toBe(true);
	});

	it("accepts a hashed token nonce when the request provides the raw native iOS nonce", async () => {
		const rawNonce = "raw-native-ios-nonce";
		const hashedNonce = createHash("sha256").update(rawNonce).digest("hex");
		const { publicJWK, token } = await createSignedAppleToken(hashedNonce);
		mockAppleJwks(publicJWK);

		const provider = apple({
			clientId: "service.example.app",
			clientSecret: "test-secret",
			appBundleIdentifier: "com.example.app",
		});

		await expect(provider.verifyIdToken(token, rawNonce)).resolves.toBe(true);
	});

	it("rejects a mismatched nonce", async () => {
		const rawNonce = "raw-native-ios-nonce";
		const hashedNonce = createHash("sha256").update(rawNonce).digest("hex");
		const { publicJWK, token } = await createSignedAppleToken(hashedNonce);
		mockAppleJwks(publicJWK);

		const provider = apple({
			clientId: "service.example.app",
			clientSecret: "test-secret",
			appBundleIdentifier: "com.example.app",
		});

		await expect(
			provider.verifyIdToken(token, "different-nonce"),
		).resolves.toBe(false);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/1214
	 */
	it("forwards request ctx to a custom verifyIdToken option", async () => {
		const ctx = {
			headers: new Headers({ "x-platform": "ios" }),
		} as GenericEndpointContext;
		let seenPlatform: string | null = null;

		const provider = apple({
			clientId: "service.example.app",
			clientSecret: "test-secret",
			verifyIdToken: async (_token, _nonce, requestCtx) => {
				seenPlatform = requestCtx?.headers?.get("x-platform") ?? null;
				return seenPlatform === "ios";
			},
		});

		await expect(provider.verifyIdToken("token", "nonce", ctx)).resolves.toBe(
			true,
		);
		expect(seenPlatform).toBe("ios");
	});
});
