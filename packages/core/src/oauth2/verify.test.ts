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
		kid: string,
		payload: Record<string, unknown> = {},
	) {
		return await new SignJWT({
			sub: "user-123",
			iss: issuer,
			aud: audience,
			...payload,
		})
			.setProtectedHeader({ alg: "RS256", kid })
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

	async function expectTokenInvalid(promise: Promise<unknown>) {
		try {
			await promise;
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(APIError);
			expect(error).toMatchObject({
				status: "UNAUTHORIZED",
				statusCode: 401,
				message: "token invalid",
				body: {
					message: "token invalid",
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

		await expectTokenInvalid(
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

		await expectTokenInvalid(
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

		await expectTokenInvalid(
			verifyAccessToken(token, {
				jwksUrl,
				verifyOptions: { issuer, audience },
			}),
		);
	});
});
