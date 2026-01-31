import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateToken } from "./validate-authorization-code";

vi.mock("@better-fetch/fetch", () => ({
	betterFetch: vi.fn(),
}));

import { betterFetch } from "@better-fetch/fetch";

const mockedBetterFetch = vi.mocked(betterFetch);

describe("validateToken", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	async function createTestJWKS(alg: string, crv?: string) {
		const { publicKey, privateKey } = await generateKeyPair(alg, {
			crv,
			extractable: true,
		});
		const publicJWK = await exportJWK(publicKey);
		const privateJWK = await exportJWK(privateKey);
		const kid = `test-key-${Date.now()}`;
		publicJWK.kid = kid;
		privateJWK.kid = kid;
		return { publicJWK, privateJWK, kid, publicKey, privateKey };
	}

	async function createSignedToken(
		privateKey: CryptoKey,
		alg: string,
		kid: string,
		payload: Record<string, unknown> = {},
	) {
		return await new SignJWT({
			sub: "user-123",
			email: "test@example.com",
			iss: "https://example.com",
			aud: "test-client",
			...payload,
		})
			.setProtectedHeader({ alg, kid })
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(privateKey);
	}

	it("should verify RS256 signed token", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);

		mockedBetterFetch.mockResolvedValueOnce({
			data: { keys: [publicJWK] },
			error: null,
		});

		const result = await validateToken(
			token,
			"https://example.com/.well-known/jwks",
		);

		expect(result).toBeDefined();
		expect(result.payload.sub).toBe("user-123");
		expect(result.payload.email).toBe("test@example.com");
		expect(mockedBetterFetch).toHaveBeenCalledWith(
			"https://example.com/.well-known/jwks",
			expect.objectContaining({ method: "GET" }),
		);
	});

	it("should verify ES256 signed token", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS("ES256");
		const token = await createSignedToken(privateKey, "ES256", kid);

		mockedBetterFetch.mockResolvedValueOnce({
			data: { keys: [publicJWK] },
			error: null,
		});

		const result = await validateToken(
			token,
			"https://example.com/.well-known/jwks",
		);

		expect(result).toBeDefined();
		expect(result.payload.sub).toBe("user-123");
	});

	it("should verify EdDSA (Ed25519) signed token", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS(
			"EdDSA",
			"Ed25519",
		);
		const token = await createSignedToken(privateKey, "EdDSA", kid);

		mockedBetterFetch.mockResolvedValueOnce({
			data: { keys: [publicJWK] },
			error: null,
		});

		const result = await validateToken(
			token,
			"https://example.com/.well-known/jwks",
		);

		expect(result).toBeDefined();
		expect(result.payload.sub).toBe("user-123");
	});

	it("should throw 'Key not found' when kid doesn't match", async () => {
		const { publicJWK, privateKey } = await createTestJWKS("RS256");
		publicJWK.kid = "different-kid";
		const token = await createSignedToken(privateKey, "RS256", "original-kid");

		mockedBetterFetch.mockResolvedValueOnce({
			data: { keys: [publicJWK] },
			error: null,
		});

		await expect(
			validateToken(token, "https://example.com/.well-known/jwks"),
		).rejects.toThrow("Key not found");
	});

	it("should find correct key when multiple keys exist", async () => {
		const key1 = await createTestJWKS("RS256");
		const key2 = await createTestJWKS("RS256");
		const key3 = await createTestJWKS("ES256");
		const token = await createSignedToken(key2.privateKey, "RS256", key2.kid);

		mockedBetterFetch.mockResolvedValueOnce({
			data: { keys: [key1.publicJWK, key2.publicJWK, key3.publicJWK] },
			error: null,
		});

		const result = await validateToken(
			token,
			"https://example.com/.well-known/jwks",
		);

		expect(result).toBeDefined();
		expect(result.payload.sub).toBe("user-123");
	});

	it("should throw when JWKS returns empty keys array", async () => {
		const { privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);

		mockedBetterFetch.mockResolvedValueOnce({
			data: { keys: [] },
			error: null,
		});

		await expect(
			validateToken(token, "https://example.com/.well-known/jwks"),
		).rejects.toThrow("Key not found");
	});

	it("should throw when JWKS fetch fails", async () => {
		const { privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);

		mockedBetterFetch.mockResolvedValueOnce({
			data: null,
			error: { status: 500, statusText: "Internal Server Error" },
		});

		await expect(
			validateToken(token, "https://example.com/.well-known/jwks"),
		).rejects.toBeDefined();
	});
});
