import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { validateToken } from "./validate-authorization-code";

describe("validateToken", () => {
	const originalFetch = globalThis.fetch;
	const mockedFetch = vi.fn() as unknown as typeof fetch &
		ReturnType<typeof vi.fn>;

	beforeAll(() => {
		globalThis.fetch = mockedFetch;
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	beforeEach(() => {
		mockedFetch.mockReset();
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
		publicJWK.alg = alg;
		privateJWK.kid = kid;
		privateJWK.alg = alg;
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

	function mockJWKSResponse(...publicJWKs: JWK[]) {
		mockedFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ keys: publicJWKs }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
	}

	it("should verify RS256 signed token", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);
		mockJWKSResponse(publicJWK);

		const result = await validateToken(
			token,
			"https://example.com/.well-known/jwks",
		);

		expect(result).toBeDefined();
		expect(result.payload.sub).toBe("user-123");
		expect(result.payload.email).toBe("test@example.com");
	});

	it("should verify ES256 signed token", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS("ES256");
		const token = await createSignedToken(privateKey, "ES256", kid);
		mockJWKSResponse(publicJWK);

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
		mockJWKSResponse(publicJWK);

		const result = await validateToken(
			token,
			"https://example.com/.well-known/jwks",
		);

		expect(result).toBeDefined();
		expect(result.payload.sub).toBe("user-123");
	});

	it("should throw when kid doesn't match any key", async () => {
		const { publicJWK, privateKey } = await createTestJWKS("RS256");
		publicJWK.kid = "different-kid";
		const token = await createSignedToken(privateKey, "RS256", "original-kid");
		mockJWKSResponse(publicJWK);

		await expect(
			validateToken(token, "https://example.com/.well-known/jwks"),
		).rejects.toThrow();
	});

	it("should find correct key when multiple keys exist", async () => {
		const key1 = await createTestJWKS("RS256");
		const key2 = await createTestJWKS("RS256");
		const key3 = await createTestJWKS("ES256");
		const token = await createSignedToken(key2.privateKey, "RS256", key2.kid);
		mockJWKSResponse(key1.publicJWK, key2.publicJWK, key3.publicJWK);

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
		mockJWKSResponse();

		await expect(
			validateToken(token, "https://example.com/.well-known/jwks"),
		).rejects.toThrow();
	});

	it("should throw when JWKS fetch fails", async () => {
		const { privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);
		mockedFetch.mockResolvedValueOnce(
			new Response("Internal Server Error", { status: 500 }),
		);

		await expect(
			validateToken(token, "https://example.com/.well-known/jwks"),
		).rejects.toBeDefined();
	});

	it("should verify token with matching audience", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);
		mockJWKSResponse(publicJWK);

		const result = await validateToken(
			token,
			"https://example.com/.well-known/jwks",
			{ audience: "test-client" },
		);

		expect(result).toBeDefined();
		expect(result.payload.aud).toBe("test-client");
	});

	it("should reject token with mismatched audience", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);
		mockJWKSResponse(publicJWK);

		await expect(
			validateToken(token, "https://example.com/.well-known/jwks", {
				audience: "wrong-client",
			}),
		).rejects.toThrow();
	});

	it("should verify token with matching issuer", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);
		mockJWKSResponse(publicJWK);

		const result = await validateToken(
			token,
			"https://example.com/.well-known/jwks",
			{ issuer: "https://example.com" },
		);

		expect(result).toBeDefined();
		expect(result.payload.iss).toBe("https://example.com");
	});

	it("should reject token with mismatched issuer", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);
		mockJWKSResponse(publicJWK);

		await expect(
			validateToken(token, "https://example.com/.well-known/jwks", {
				issuer: "https://wrong-issuer.com",
			}),
		).rejects.toThrow();
	});

	it("should verify token with both audience and issuer", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);
		mockJWKSResponse(publicJWK);

		const result = await validateToken(
			token,
			"https://example.com/.well-known/jwks",
			{
				audience: "test-client",
				issuer: "https://example.com",
			},
		);

		expect(result).toBeDefined();
		expect(result.payload.aud).toBe("test-client");
		expect(result.payload.iss).toBe("https://example.com");
	});
});
