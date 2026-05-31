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
	it("should translate missing kid failures to unauthorized API errors", async () => {
		const { privateKey } = await createTestJWKS();
		const token = await createSignedToken(privateKey, undefined);

		await expectUnauthorized(
			verifyAccessToken(token, {
				jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		);
		expect(mockedFetch).not.toHaveBeenCalled();
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
});
