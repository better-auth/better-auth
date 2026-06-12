import { APIError } from "better-call";
import type { JWK } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { verifyAccessToken } from "./verify";

const issuer = "https://auth.example.com";
const audience = "https://api.example.com/v1";
const jwksUrl = `${issuer}/jwks`;

const mockedFetch = vi.fn() as unknown as typeof fetch &
	ReturnType<typeof vi.fn>;

let keyCounter = 0;

describe("verifyAccessToken", () => {
	const originalFetch = globalThis.fetch;

	beforeAll(() => {
		globalThis.fetch = mockedFetch;
	});

	afterEach(() => {
		mockedFetch.mockReset();
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	async function createTestJWKS(kid = `verify-access-token-${++keyCounter}`) {
		const { publicKey, privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const publicJWK = await exportJWK(publicKey);
		publicJWK.kid = kid;
		publicJWK.alg = "RS256";
		return { publicJWK, privateKey, kid };
	}

	async function createSignedToken(
		privateKey: CryptoKey,
		kid: string | undefined,
		payload: Record<string, unknown> = {},
		expirationTime: string | number | Date = "1h",
	) {
		const protectedHeader = kid ? { alg: "RS256", kid } : { alg: "RS256" };

		return await new SignJWT({
			sub: "user-123",
			iss: issuer,
			aud: audience,
			...payload,
		})
			.setProtectedHeader(protectedHeader)
			.setIssuedAt()
			.setExpirationTime(expirationTime)
			.sign(privateKey);
	}

	function mockJWKSResponse(...publicJWKs: JWK[]) {
		mockJSONResponse({ keys: publicJWKs });
	}

	function mockJSONResponse(body: unknown) {
		mockedFetch.mockResolvedValueOnce(
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
	}

	function jwksResponse(...publicJWKs: JWK[]) {
		return new Response(JSON.stringify({ keys: publicJWKs }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}

	function requestUrl(input: unknown): string {
		if (typeof input === "string") return input;
		if (input instanceof Request) return input.url;
		return String((input as { url?: unknown } | null)?.url ?? input);
	}

	async function expectUnauthorized(
		promise: Promise<unknown>,
		message = "invalid access token",
	) {
		try {
			await promise;
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
			expect(error).toMatchObject({
				status: "UNAUTHORIZED",
				statusCode: 401,
				message,
				body: {
					message,
				},
			});
		}
	}

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9654
	 */
	it("should translate jose claim validation failures to unauthorized API errors", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS();
		const token = await createSignedToken(privateKey, kid, {
			aud: "https://api.example.com/other",
		});
		mockJWKSResponse(publicJWK);

		await expectUnauthorized(
			verifyAccessToken(token, {
				jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9654
	 */
	it("should translate jose signature verification failures to unauthorized API errors", async () => {
		const signingKey = await createTestJWKS();
		const verificationKey = await createTestJWKS();
		const token = await createSignedToken(
			signingKey.privateKey,
			signingKey.kid,
		);
		const publicJWKWithMatchingKid: JWK = {
			...verificationKey.publicJWK,
			kid: signingKey.kid,
		};
		mockJWKSResponse(publicJWKWithMatchingKid);

		await expectUnauthorized(
			verifyAccessToken(token, {
				jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9654
	 */
	it("should translate jose no matching key failures to unauthorized API errors", async () => {
		const signingKey = await createTestJWKS();
		const unrelatedKey = await createTestJWKS();
		const token = await createSignedToken(
			signingKey.privateKey,
			signingKey.kid,
		);
		mockJWKSResponse(unrelatedKey.publicJWK);

		await expectUnauthorized(
			verifyAccessToken(token, {
				jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9654
	 */
	it("should verify a JWS without kid using the fetched JWKS", async () => {
		const { publicJWK, privateKey } = await createTestJWKS();
		const token = await createSignedToken(privateKey, undefined);
		mockJWKSResponse(publicJWK);

		await expect(
			verifyAccessToken(token, {
				jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });
		expect(mockedFetch).toHaveBeenCalledTimes(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9654
	 */
	it("should keep expired token failures as expired unauthorized API errors", async () => {
		const { publicJWK, privateKey, kid } = await createTestJWKS();
		const token = await createSignedToken(
			privateKey,
			kid,
			{},
			Math.floor(Date.now() / 1000) - 60,
		);
		mockJWKSResponse(publicJWK);

		await expectUnauthorized(
			verifyAccessToken(token, {
				jwksUrl,
				verifyOptions: { issuer, audience },
			}),
			"token expired",
		);
	});

	it("should not verify a token against a JWKS cached for a different issuer with a colliding kid", async () => {
		vi.resetModules();
		const { verifyAccessToken: verify } = await import("./verify");

		const sharedKid = "shared-kid";
		const keyA = await createTestJWKS(sharedKid);
		const keyB = await createTestJWKS(sharedKid);

		const issuerA = "https://issuer-a.example.com";
		const audienceA = "https://issuer-a.example.com/api";
		const jwksUrlA = `${issuerA}/jwks`;
		const issuerB = "https://issuer-b.example.com";
		const jwksUrlB = `${issuerB}/jwks`;

		mockedFetch.mockImplementation((input: unknown) => {
			const url = requestUrl(input);
			return Promise.resolve(
				url.includes("issuer-b")
					? jwksResponse(keyB.publicJWK)
					: jwksResponse(keyA.publicJWK),
			);
		});

		// 1. Source B's JWKS gets cached by verifying a token signed with B's key
		//    against B's own source.
		const tokenForB = await createSignedToken(keyB.privateKey, sharedKid, {
			iss: issuerB,
			aud: issuerB,
		});
		await expect(
			verify(tokenForB, {
				jwksUrl: jwksUrlB,
				verifyOptions: { issuer: issuerB, audience: issuerB },
			}),
		).resolves.toMatchObject({ iss: issuerB });

		// 2. A token signed with B's key but carrying source A's issuer/audience
		//    and the same colliding kid.
		const tokenWithAClaims = await createSignedToken(
			keyB.privateKey,
			sharedKid,
			{ iss: issuerA, aud: audienceA },
		);

		// Verifying it against source A must fetch A's own key and reject it,
		// rather than reusing the key set cached for source B.
		await expectUnauthorized(
			verify(tokenWithAClaims, {
				jwksUrl: jwksUrlA,
				verifyOptions: { issuer: issuerA, audience: audienceA },
			}),
		);

		mockedFetch.mockReset();
		vi.resetModules();
	});

	it("should refetch a rotated key set once the cache TTL has elapsed", async () => {
		vi.resetModules();
		const { verifyAccessToken: verify } = await import("./verify");

		const rotatingKid = "rotating-kid";
		const oldKey = await createTestJWKS(rotatingKid);
		const newKey = await createTestJWKS(rotatingKid);
		const rotateIssuer = "https://rotate.example.com";
		const rotateJwksUrl = `${rotateIssuer}/jwks`;

		let currentKey = oldKey.publicJWK;
		mockedFetch.mockImplementation(() =>
			Promise.resolve(jwksResponse(currentKey)),
		);

		const oldToken = await createSignedToken(oldKey.privateKey, rotatingKid, {
			iss: rotateIssuer,
			aud: rotateIssuer,
		});
		await expect(
			verify(oldToken, {
				jwksUrl: rotateJwksUrl,
				verifyOptions: { issuer: rotateIssuer, audience: rotateIssuer },
			}),
		).resolves.toMatchObject({ iss: rotateIssuer });

		// The source rotates its key while keeping the same kid. A token signed
		// with the rotated-out key must stop verifying once the cache expires.
		currentKey = newKey.publicJWK;
		const staleToken = await createSignedToken(oldKey.privateKey, rotatingKid, {
			iss: rotateIssuer,
			aud: rotateIssuer,
		});

		vi.useFakeTimers();
		try {
			vi.setSystemTime(Date.now() + 6 * 60 * 1000);
			await expectUnauthorized(
				verify(staleToken, {
					jwksUrl: rotateJwksUrl,
					verifyOptions: { issuer: rotateIssuer, audience: rotateIssuer },
				}),
			);
		} finally {
			vi.useRealTimers();
		}

		mockedFetch.mockReset();
		vi.resetModules();
	});

	it("should not retain function jwks sources in the cache", async () => {
		vi.resetModules();
		const { verifyJwsAccessToken: verify, jwksCache } = await import(
			"./verify"
		);
		const { publicJWK, privateKey, kid } = await createTestJWKS();
		const token = await createSignedToken(privateKey, kid);

		// A fresh closure per call, like per-request callers do.
		for (let i = 0; i < 3; i++) {
			await expect(
				verify(token, {
					jwksFetch: async () => ({ keys: [publicJWK] }),
					verifyOptions: { issuer, audience },
				}),
			).resolves.toMatchObject({ sub: "user-123" });
		}

		expect(jwksCache.size).toBe(0);
		vi.resetModules();
	});

	it("should invoke a function jwks source on every verification", async () => {
		vi.resetModules();
		const { verifyJwsAccessToken: verify } = await import("./verify");
		const { publicJWK, privateKey, kid } = await createTestJWKS();
		const token = await createSignedToken(privateKey, kid);
		const jwksFetch = vi.fn(async () => ({ keys: [publicJWK] }));

		await expect(
			verify(token, { jwksFetch, verifyOptions: { issuer, audience } }),
		).resolves.toMatchObject({ sub: "user-123" });
		await expect(
			verify(token, { jwksFetch, verifyOptions: { issuer, audience } }),
		).resolves.toMatchObject({ sub: "user-123" });

		expect(jwksFetch).toHaveBeenCalledTimes(2);
		vi.resetModules();
	});

	it("should fetch a function jwks source once across verifications sharing a jwksCacheKey", async () => {
		vi.resetModules();
		const { verifyJwsAccessToken: verify } = await import("./verify");
		const { publicJWK, privateKey, kid } = await createTestJWKS();
		const token = await createSignedToken(privateKey, kid);
		const jwksCacheKey = {};
		let fetchCount = 0;

		// A fresh closure per call, like per-request callers do.
		for (let i = 0; i < 3; i++) {
			await expect(
				verify(token, {
					jwksFetch: async () => {
						fetchCount++;
						return { keys: [publicJWK] };
					},
					jwksCacheKey,
					verifyOptions: { issuer, audience },
				}),
			).resolves.toMatchObject({ sub: "user-123" });
		}

		expect(fetchCount).toBe(1);
		vi.resetModules();
	});

	it("should isolate cached function jwks sources by jwksCacheKey object", async () => {
		vi.resetModules();
		const { verifyJwsAccessToken: verify } = await import("./verify");
		const sourceA = await createTestJWKS();
		const sourceB = await createTestJWKS();
		const tokenA = await createSignedToken(sourceA.privateKey, sourceA.kid);
		const tokenB = await createSignedToken(sourceB.privateKey, sourceB.kid);
		const cacheKeyA = {};
		const cacheKeyB = {};
		const fetchA = vi.fn(async () => ({ keys: [sourceA.publicJWK] }));
		const fetchB = vi.fn(async () => ({ keys: [sourceB.publicJWK] }));

		await expect(
			verify(tokenA, {
				jwksFetch: fetchA,
				jwksCacheKey: cacheKeyA,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });
		await expect(
			verify(tokenB, {
				jwksFetch: fetchB,
				jwksCacheKey: cacheKeyB,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });
		// Source B's fetch must not have evicted source A's entry.
		await expect(
			verify(tokenA, {
				jwksFetch: fetchA,
				jwksCacheKey: cacheKeyA,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });

		expect(fetchA).toHaveBeenCalledTimes(1);
		expect(fetchB).toHaveBeenCalledTimes(1);
		vi.resetModules();
	});

	it("should refetch a function jwks source when the token kid is missing from the cached set", async () => {
		vi.resetModules();
		const { verifyJwsAccessToken: verify } = await import("./verify");
		const oldKey = await createTestJWKS();
		const newKey = await createTestJWKS();
		const jwksCacheKey = {};
		let currentKeys = [oldKey.publicJWK];
		const jwksFetch = vi.fn(async () => ({ keys: currentKeys }));

		const oldToken = await createSignedToken(oldKey.privateKey, oldKey.kid);
		await expect(
			verify(oldToken, {
				jwksFetch,
				jwksCacheKey,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });

		// A newly rotated-in kid is absent from the cached set and must refetch.
		currentKeys = [oldKey.publicJWK, newKey.publicJWK];
		const newToken = await createSignedToken(newKey.privateKey, newKey.kid);
		await expect(
			verify(newToken, {
				jwksFetch,
				jwksCacheKey,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });

		expect(jwksFetch).toHaveBeenCalledTimes(2);
		vi.resetModules();
	});

	it("should refetch a cached jwks source when a no-kid token fails against the cached set", async () => {
		vi.resetModules();
		const { verifyJwsAccessToken: verify } = await import("./verify");
		const oldKey = await createTestJWKS();
		const newKey = await createTestJWKS();
		let currentKey = oldKey.publicJWK;
		mockedFetch.mockImplementation(() =>
			Promise.resolve(jwksResponse(currentKey)),
		);

		const oldToken = await createSignedToken(oldKey.privateKey, undefined);
		await expect(
			verify(oldToken, {
				jwksFetch: jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });

		currentKey = newKey.publicJWK;
		const newToken = await createSignedToken(newKey.privateKey, undefined);
		await expect(
			verify(newToken, {
				jwksFetch: jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });

		expect(mockedFetch).toHaveBeenCalledTimes(2);
		mockedFetch.mockReset();
		vi.resetModules();
	});

	it("should not repeatedly refetch a fresh jwks source for invalid no-kid tokens", async () => {
		vi.resetModules();
		const { verifyJwsAccessToken: verify } = await import("./verify");
		const validKey = await createTestJWKS();
		const invalidKey = await createTestJWKS();
		mockedFetch.mockImplementation(() =>
			Promise.resolve(jwksResponse(validKey.publicJWK)),
		);

		const validToken = await createSignedToken(validKey.privateKey, undefined);
		await expect(
			verify(validToken, {
				jwksFetch: jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });

		const invalidToken = await createSignedToken(
			invalidKey.privateKey,
			undefined,
		);
		await expect(
			verify(invalidToken, {
				jwksFetch: jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		).rejects.toThrow();
		await expect(
			verify(invalidToken, {
				jwksFetch: jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		).rejects.toThrow();

		expect(mockedFetch).toHaveBeenCalledTimes(2);
		mockedFetch.mockReset();
		vi.resetModules();
	});

	it("should cache a string jwks source across verifications within the TTL", async () => {
		vi.resetModules();
		const { verifyJwsAccessToken: verify } = await import("./verify");
		const { publicJWK, privateKey, kid } = await createTestJWKS();
		const token = await createSignedToken(privateKey, kid);
		mockedFetch.mockImplementation(() =>
			Promise.resolve(jwksResponse(publicJWK)),
		);

		await expect(
			verify(token, {
				jwksFetch: jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });
		await expect(
			verify(token, {
				jwksFetch: jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		).resolves.toMatchObject({ sub: "user-123" });

		expect(mockedFetch).toHaveBeenCalledTimes(1);
		mockedFetch.mockReset();
		vi.resetModules();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9654
	 */
	it("should leave JWKS infrastructure failures as jose errors", async () => {
		vi.resetModules();
		const { errors: isolatedJoseErrors } = await import("jose");
		const { verifyAccessToken: verifyAccessTokenWithIsolatedJwksCache } =
			await import("./verify");
		const { privateKey, kid } = await createTestJWKS();
		const token = await createSignedToken(privateKey, kid);
		mockJSONResponse({ keys: {} });

		try {
			await expect(
				verifyAccessTokenWithIsolatedJwksCache(token, {
					jwksUrl,
					verifyOptions: { issuer, audience },
				}),
			).rejects.toBeInstanceOf(isolatedJoseErrors.JWKSInvalid);
		} finally {
			vi.resetModules();
		}
	});

	describe("remote introspection audience validation", () => {
		const introspectUrl = `${issuer}/oauth2/introspect`;
		const remoteVerify = {
			introspectUrl,
			clientId: "rs-client",
			clientSecret: "rs-secret",
		};

		function mockIntrospection(body: Record<string, unknown>) {
			mockJSONResponse({ active: true, iss: issuer, sub: "user-123", ...body });
		}

		it("should reject an active token when audience is required but introspection omits aud", async () => {
			mockIntrospection({ scope: "read" });

			await expect(
				verifyAccessToken("opaque-token-for-another-resource", {
					verifyOptions: { issuer, audience },
					remoteVerify,
				}),
			).rejects.toThrow();
		});

		it("should reject an active token whose introspected aud is for a different resource", async () => {
			mockIntrospection({
				aud: "https://api.example.com/other",
				scope: "read",
			});

			await expect(
				verifyAccessToken("token-minted-for-other-api", {
					verifyOptions: { issuer, audience },
					remoteVerify,
				}),
			).rejects.toThrow();
		});

		it("should accept an active token whose introspected aud matches", async () => {
			mockIntrospection({ aud: audience, scope: "read" });

			await expect(
				verifyAccessToken("valid-token", {
					verifyOptions: { issuer, audience },
					remoteVerify,
				}),
			).resolves.toMatchObject({ aud: audience, sub: "user-123" });
		});

		it("should accept an aud-less introspection response only when allowMissingAudience is enabled", async () => {
			mockIntrospection({ scope: "read" });

			await expect(
				verifyAccessToken("opaque-token", {
					verifyOptions: { issuer, audience },
					remoteVerify: { ...remoteVerify, allowMissingAudience: true },
				}),
			).resolves.toMatchObject({ sub: "user-123" });
		});

		it("should still enforce a mismatching aud even when allowMissingAudience is enabled", async () => {
			mockIntrospection({
				aud: "https://api.example.com/other",
				scope: "read",
			});

			await expect(
				verifyAccessToken("token-minted-for-other-api", {
					verifyOptions: { issuer, audience },
					remoteVerify: { ...remoteVerify, allowMissingAudience: true },
				}),
			).rejects.toThrow();
		});
	});
});
