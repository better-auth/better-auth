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
import { jwksCache, verifyJwsAccessToken } from "./verify";

describe("validateToken", () => {
	const originalFetch = globalThis.fetch;
	const jwksEndpoint = "https://example.com/.well-known/jwks";
	const mockedFetch = vi.fn() as unknown as typeof fetch &
		ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockedFetch.mockReset();
		jwksCache.clear();
	});

	beforeAll(() => {
		globalThis.fetch = mockedFetch;
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
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

	/**
	 * The JWKS endpoint is reached via OIDC discovery, so its URL is influenced by
	 * data an authenticated user can register; following a redirect could bounce
	 * the server-side request to an internal address.
	 */
	it("refuses a redirecting JWKS endpoint and fetches with redirects disabled", async () => {
		const { privateKey, kid } = await createTestJWKS("RS256");
		const token = await createSignedToken(privateKey, "RS256", kid);
		mockedFetch.mockClear();
		mockedFetch.mockResolvedValueOnce(
			new Response("", {
				status: 302,
				headers: { location: "http://169.254.169.254/" },
			}),
		);

		await expect(
			validateToken(token, "https://example.com/.well-known/jwks"),
		).rejects.toThrow(/refuse redirects to prevent SSRF/);

		expect(mockedFetch).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ redirect: "manual" }),
		);
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

	/**
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
	 */
	describe("verification policy", () => {
		it("rejects a valid signature using an algorithm outside the allowlist", async () => {
			const { publicJWK, privateKey, kid } = await createTestJWKS("ES256");
			const token = await createSignedToken(privateKey, "ES256", kid);
			mockJWKSResponse(publicJWK);

			await expect(
				validateToken(token, jwksEndpoint, { algorithms: ["RS256"] }),
			).rejects.toMatchObject({ code: "ERR_JOSE_ALG_NOT_ALLOWED" });
		});

		it("rejects a signed token missing a required claim", async () => {
			const { publicJWK, privateKey, kid } = await createTestJWKS("RS256");
			const token = new SignJWT({ sub: "user-123" }).setProtectedHeader({
				alg: "RS256",
				kid,
			});
			mockJWKSResponse(publicJWK);

			await expect(
				validateToken(await token.sign(privateKey), jwksEndpoint, {
					requiredClaims: ["exp"],
				}),
			).rejects.toMatchObject({
				code: "ERR_JWT_CLAIM_VALIDATION_FAILED",
				claim: "exp",
			});
		});
	});

	/**
	 * @see https://openid.net/specs/openid-connect-core-1_0.html#RotateSigKeys
	 */
	describe("signing key cache", () => {
		it("reuses signing keys across repeated verifications", async () => {
			const { publicJWK, privateKey, kid } = await createTestJWKS("RS256");
			const token = await createSignedToken(privateKey, "RS256", kid);
			mockedFetch.mockImplementation(async () =>
				Response.json({ keys: [publicJWK] }),
			);

			await validateToken(token, jwksEndpoint);
			await validateToken(token, jwksEndpoint);

			expect(mockedFetch).toHaveBeenCalledTimes(1);
		});

		it("shares cached keys with access token verification", async () => {
			const { publicJWK, privateKey, kid } = await createTestJWKS("RS256");
			const token = await createSignedToken(privateKey, "RS256", kid);
			mockedFetch.mockImplementation(async () =>
				Response.json({ keys: [publicJWK] }),
			);

			await validateToken(token, jwksEndpoint);
			await verifyJwsAccessToken(token, {
				jwksFetch: jwksEndpoint,
				verifyOptions: {
					issuer: "https://example.com",
					audience: "test-client",
				},
			});

			expect(mockedFetch).toHaveBeenCalledTimes(1);
		});

		it("refreshes cached keys for a rotated token without kid", async () => {
			const first = await createTestJWKS("RS256");
			const second = await createTestJWKS("RS256");
			mockJWKSResponse(first.publicJWK);
			await validateToken(
				await createSignedToken(first.privateKey, "RS256", first.kid),
				jwksEndpoint,
			);
			mockJWKSResponse(second.publicJWK);
			const token = await new SignJWT({ sub: "user-123" })
				.setProtectedHeader({ alg: "RS256" })
				.setIssuedAt()
				.setExpirationTime("1h")
				.sign(second.privateKey);

			await expect(validateToken(token, jwksEndpoint)).resolves.toMatchObject({
				payload: { sub: "user-123" },
			});
			expect(mockedFetch).toHaveBeenCalledTimes(2);
		});

		it("keeps signing keys isolated by endpoint", async () => {
			const first = await createTestJWKS("RS256");
			const second = await createTestJWKS("RS256");
			const kid = "shared-key";
			const firstToken = await createSignedToken(
				first.privateKey,
				"RS256",
				kid,
			);
			const secondToken = await createSignedToken(
				second.privateKey,
				"RS256",
				kid,
			);
			mockJWKSResponse({ ...first.publicJWK, kid });
			mockJWKSResponse({ ...second.publicJWK, kid });
			mockJWKSResponse({ ...second.publicJWK, kid });

			await validateToken(firstToken, jwksEndpoint);
			await validateToken(secondToken, `${jwksEndpoint}/other`);
			await expect(
				validateToken(firstToken, `${jwksEndpoint}/other`),
			).rejects.toMatchObject({
				code: "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
			});
		});

		it("refreshes cached keys after rotation", async () => {
			vi.useFakeTimers({ toFake: ["Date"] });
			try {
				const first = await createTestJWKS("RS256");
				const second = await createTestJWKS("RS256");
				second.publicJWK.kid = "rotated-key";
				const firstToken = await createSignedToken(
					first.privateKey,
					"RS256",
					first.kid,
				);
				const secondToken = await createSignedToken(
					second.privateKey,
					"RS256",
					"rotated-key",
				);
				mockJWKSResponse(first.publicJWK);
				mockJWKSResponse(second.publicJWK);

				await validateToken(firstToken, jwksEndpoint);
				vi.advanceTimersByTime(31_000);
				const result = await validateToken(secondToken, jwksEndpoint);

				expect(result.payload.sub).toBe("user-123");
				expect(mockedFetch).toHaveBeenCalledTimes(2);
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
