import type { BetterAuthPlugin } from "..";
import type {
	CustomJwtClaims,
	customJwtClaimsSchema,
	jwkExportedSchema,
	JwkOptions,
	jwkOptionsSchema,
	JwtPluginOptions,
	VerifyJwtOptions,
	verifyJwtOptionsSchema,
} from "./types";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthEndpoint } from "..";
import { jwt } from ".";
import { jwtClient } from "./client";
import { generateExportedKeyPair } from "./jwk";
import { signJwt } from "./sign";
import { verifyJwt } from "./verify";
import { createLocalJWKSet, jwtVerify, type JWK } from "jose";
import { describe, expect, it } from "vitest";
import z from "zod/v4";

describe("jwt", async () => {
	type IsEqual<T, U, Y = unknown, N = never> = (<G>() => G extends T
		? 1
		: 2) extends <G>() => G extends U ? 1 : 2
		? Y
		: N;

	// Compile-time type checks
	type Eq1 = IsEqual<
		z.infer<typeof verifyJwtOptionsSchema>,
		VerifyJwtOptions,
		true,
		false
	>;
	const typeCheck1: Eq1 = true;

	type Eq2 = IsEqual<z.infer<typeof jwkExportedSchema>, JWK, true, false>;
	const typeCheck2: Eq2 = true;

	type Eq3 = IsEqual<z.infer<typeof jwkOptionsSchema>, JwkOptions, true, false>;
	const typeCheck3: Eq3 = true;

	type Eq4 = IsEqual<
		z.infer<typeof customJwtClaimsSchema>,
		CustomJwtClaims,
		true,
		false
	>;
	const typeCheck4: Eq4 = true;

	// Create one TestInstance to infer types
	const { auth: testAuth } = await getTestInstance({
		plugins: [jwt()],
	});

	const testClient = createAuthClient({
		plugins: [jwtClient()],
	});

	type TestInstance = typeof testAuth;
	type TestClient = typeof testClient;

	async function createTestCase(
		jwtOptions?: JwtPluginOptions,
	): Promise<{ auth: TestInstance; headers: Headers; client: TestClient }> {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [jwt(jwtOptions)],
			logger: {
				level: "error",
			},
		});
		const { headers } = await signInWithTestUser();
		const client = createAuthClient({
			plugins: [jwtClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});
		return { auth, headers, client };
	}
	// Testing the default behaviour
	it("Client should get a token from the session", async () => {
		const { headers, client } = await createTestCase();

		let token = "";
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					token = context.response.headers.get("set-auth-jwt") || "";
				},
			},
		});

		expect(token.length).toBeGreaterThan(10);
	});

	it("Client should get a token", async () => {
		const { headers, client } = await createTestCase();

		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		expect(token.data?.token).toBeDefined();
	});

	it("Client should get the JWKS", async () => {
		const { auth, client } = await createTestCase();

		// If no JWK exists, this makes sure it gets added
		const jwk = await auth.api.createJwk({ body: {} });

		const jwks = await client.jwks();

		expect(jwks.data?.keys).length.above(0);
		expect(jwks.data?.keys[0].alg).toBe("EdDSA");
		expect(jwks.data?.keys[0]).toStrictEqual(jwk.key);
	});

	it("Should be able to validate signed tokens with the JWKS", async () => {
		const { headers, client } = await createTestCase();

		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		const jwks = await client.jwks();

		const localJwks = createLocalJWKSet(jwks.data!);
		const decoded = await jwtVerify(token.data?.token!, localJwks);

		expect(decoded).toBeDefined();
	});

	it("Should set subject to `session.user.id` by default", async () => {
		const { headers, client } = await createTestCase();

		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		const jwks = await client.jwks();

		const localJwks = createLocalJWKSet(jwks.data!);
		const decoded = await jwtVerify(token.data?.token!, localJwks);
		expect(decoded.payload.sub).toBeDefined();
		expect(decoded.payload.sub).toBe(decoded.payload.id);
	});

	it("Should set custom data if `defineSessionJwtData` is defined", async () => {
		const { headers, client } = await createTestCase({
			jwt: {
				defineSessionJwtData: ({ user }) => {
					return {
						id: user.id,
						customData: "some_data",
					};
				},
			},
		});

		const token = await client.token({ fetchOptions: { headers } });

		const jwks = await client.jwks();

		const localJwks = createLocalJWKSet(jwks.data!);
		const decoded = await jwtVerify(token.data?.token!, localJwks);

		expect(decoded.payload.customData).toBe("some_data");
	});

	it("Should set custom subject if `defineSessionJwtSubject` is defined", async () => {
		const { headers, client } = await createTestCase({
			jwt: {
				defineSessionJwtSubject: (session) => {
					return "Gollum";
				},
			},
		});
		const token = await client.token({ fetchOptions: { headers } });

		const jwks = await client.jwks();

		const localJwks = createLocalJWKSet(jwks.data!);
		const decoded = await jwtVerify(token.data?.token!, localJwks);

		expect(decoded.payload.sub).toBe("Gollum");
	});

	const algorithmsToTest: {
		keyPairConfig: JwkOptions;
		expectedOutcome: { ec: string; length: number; crv?: string; alg: string };
	}[] = [
		{
			keyPairConfig: {
				alg: "EdDSA",
				crv: "Ed25519",
			},
			expectedOutcome: {
				ec: "OKP",
				length: 43,
				crv: "Ed25519",
				alg: "EdDSA",
			},
		},
		{
			keyPairConfig: {
				alg: "ES256",
			},
			expectedOutcome: {
				ec: "EC",
				length: 43,
				crv: "P-256",
				alg: "ES256",
			},
		},
		{
			keyPairConfig: {
				alg: "ES512",
			},
			expectedOutcome: {
				ec: "EC",
				length: 88,
				crv: "P-521",
				alg: "ES512",
			},
		},
		{
			keyPairConfig: {
				alg: "PS256",
			},
			expectedOutcome: {
				ec: "RSA",
				length: 342,
				alg: "PS256",
			},
		},
		{
			keyPairConfig: {
				alg: "RS256",
			},
			expectedOutcome: {
				ec: "RSA",
				length: 342,
				alg: "RS256",
			},
		},
	];

	for (const algorithm of algorithmsToTest) {
		const expectedOutcome = algorithm.expectedOutcome;
		for (let disablePrivateKeyEncryption of [false, true]) {
			const jwtPluginOptions: JwtPluginOptions = {
				jwks: {
					keyPairConfig: {
						...algorithm.keyPairConfig,
					},
					disablePrivateKeyEncryption: disablePrivateKeyEncryption,
				},
			};
			try {
				const alg: string =
					algorithm.keyPairConfig.alg +
					("crv" in algorithm.keyPairConfig
						? `(${algorithm.keyPairConfig.crv})`
						: "");
				const enc: string = disablePrivateKeyEncryption
					? " without private key encryption"
					: "";

				it(`${alg} algorithm${enc} can be used to generate JWKS`, async () => {
					const { auth } = await createTestCase(jwtPluginOptions);
					// Unit test (JWS Supported key)
					const { publicKey, privateKey } = await generateExportedKeyPair(
						jwtPluginOptions?.jwks?.keyPairConfig,
					);
					for (const key of [publicKey, privateKey]) {
						expect(key.kty).toBe(expectedOutcome.ec);
						if (key.x) expect(key.x).toHaveLength(expectedOutcome.length);
						if (key.y) expect(key.y).toHaveLength(expectedOutcome.length);
						if (key.n) expect(key.n).toHaveLength(expectedOutcome.length);
					}

					// Functional test (JWKS)
					const jwks = await auth.api.getJwks();
					expect(jwks.keys.at(0)?.kty).toBe(expectedOutcome.ec);
					if (jwks.keys.at(0)?.crv)
						expect(jwks.keys.at(0)?.crv).toBe(expectedOutcome.crv);
					expect(jwks.keys.at(0)?.alg).toBe(expectedOutcome.alg);
					if (jwks.keys.at(0)?.x)
						expect(jwks.keys.at(0)?.x).toHaveLength(expectedOutcome.length);
					if (jwks.keys.at(0)?.y)
						expect(jwks.keys.at(0)?.y).toHaveLength(expectedOutcome.length);
					if (jwks.keys.at(0)?.n)
						expect(jwks?.keys.at(0)?.n).toHaveLength(expectedOutcome.length);
				});
				it(`${alg} algorithm${enc}: Client can sign in`, async () => {
					try {
						const { headers } = await createTestCase(jwtPluginOptions);
						expect(headers).toBeDefined();
					} catch (err) {
						console.error(err);
						expect.unreachable();
					}
				});

				it(`${alg} algorithm${enc}: Client gets a token`, async () => {
					const { headers, client } = await createTestCase(jwtPluginOptions);
					const token = await client.token({
						fetchOptions: {
							headers,
						},
					});

					expect(token.data?.token).toBeDefined();
				});

				it(`${alg} algorithm${enc}: Client gets a token from session`, async () => {
					const { headers, client } = await createTestCase(jwtPluginOptions);
					let token = "";
					await client.getSession({
						fetchOptions: {
							headers,
							onSuccess(context) {
								token = context.response.headers.get("set-auth-jwt") || "";
							},
						},
					});

					expect(token.length).toBeGreaterThan(10);
				});

				it(`${alg} algorithm${enc}: Signed tokens can be validated with the JWKS`, async () => {
					const { headers, client } = await createTestCase(jwtPluginOptions);
					const token = await client.token({
						fetchOptions: {
							headers,
						},
					});

					const jwks = await client.jwks();

					const localJwks = createLocalJWKSet(jwks.data!);
					const decoded = await jwtVerify(token.data?.token!, localJwks);

					expect(decoded).toBeDefined();
				});

				it(`${alg} algorithm${enc}: Should set subject to user id by default`, async () => {
					const { headers, client } = await createTestCase(jwtPluginOptions);
					const token = await client.token({
						fetchOptions: {
							headers,
						},
					});

					const jwks = await client.jwks();

					const localJwks = createLocalJWKSet(jwks.data!);
					const decoded = await jwtVerify(token.data?.token!, localJwks);
					expect(decoded.payload.sub).toBeDefined();
					expect(decoded.payload.sub).toBe(decoded.payload.id);
				});

				const customPlugin = () => {
					return {
						id: "customJwt",
						endpoints: {
							customSignJwt: createAuthEndpoint(
								"/custom-sign",
								{
									method: "POST",
									metadata: {
										$Infer: {
											body: {} as {
												data: Record<string, any>;
											},
										},
									},
									body: z.object({
										data: z.record(z.string(), z.any()),
									}),
								},
								async (ctx) => {
									const body = ctx.body;
									return ctx.json({
										token: await signJwt(ctx, body.data),
									});
								},
							),
							customVerifyJwt: createAuthEndpoint(
								"/custom-verify",
								{
									method: "POST",
									metadata: {
										$Infer: {
											body: {} as {
												token: string;
											},
										},
									},
									body: z.object({
										token: z.string(),
									}),
								},
								async (ctx) => {
									const body = ctx.body;
									return ctx.json({
										data: await verifyJwt(ctx, body.token),
									});
								},
							),
						},
					} satisfies BetterAuthPlugin;
				};
				it(`${alg} algorithm${enc}: Should sign JWT via custom endpoint and be able to verify it`, async () => {
					const { auth, signInWithTestUser } = await getTestInstance({
						plugins: [jwt(), customPlugin()],
						logger: {
							level: "error",
						},
					});

					const client = createAuthClient({
						plugins: [jwtClient()],
						baseURL: "http://localhost:3000/api/auth",
						fetchOptions: {
							customFetchImpl: async (url, init) => {
								return auth.handler(new Request(url, init));
							},
						},
					});
					const someData = { answer: 42 };
					const token = (
						await auth.api.customSignJwt({ body: { data: someData } })
					).token;
					expect(token.length).toBeGreaterThan(10);

					const payload = await auth.api.customVerifyJwt({
						body: { token: token },
					});
					expect(payload.data.answer).toBe(42);
				});
			} catch (err) {
				console.error(err);
				expect.unreachable();
			}
		}
	}
});

describe.each([
	{
		alg: "EdDSA",
		crv: "Ed25519",
	},
	{
		alg: "ES256",
	},
	{
		alg: "ES512",
	},
	{
		alg: "PS256",
	},
	{
		alg: "RS256",
	},
] as JwkOptions[])("signJWT - alg: $alg", async (keyPairConfig) => {
	const { auth } = await getTestInstance({
		plugins: [
			jwt({
				jwks: {
					keyPairConfig,
				},
			}),
		],
		logger: {
			level: "error",
		},
	});

	it("should sign a JWT without claims", async () => {
		const jwt = await auth.api.signJwt({
			body: {
				data: {
					sub: "123",
					exp: 1000,
					iat: 1000,
					iss: "https://example.com",
					aud: "https://example.com",
					custom: "custom",
				},
			},
		});
		expect(jwt?.token).toBeDefined();
		const { payload } = await auth.api.verifyJwt({ body: { jwt: jwt?.token } });
		// Should remove the claims from payload
		expect(payload?.sub).not.toBe("123");
		expect(payload?.exp).not.toBe(1000);
		expect(payload?.iat).not.toBe(1000);
		expect(payload?.iss).not.toBe("https://example.com");
		expect(payload?.aud).not.toBe("https://example.com");
		// But not the data
		expect(payload?.custom).toBe("custom");
	});

	it("should be a valid JWT", async () => {
		const jwt = await auth.api.signJwt({
			body: {
				data: {
					custom: "custom",
				},
				claims: {
					sub: "123",
					exp: Math.floor(Date.now() / 1000) + 600,
					//iat: Math.floor(Date.now() / 1000) // Not allowed anymore
					//iss: "https://example.com", // Not allowed anymore
					aud: "https://example.com",
				},
			},
		});
		const jwks = await auth.api.getJwks();
		const localJwks = createLocalJWKSet(jwks);

		const decoded = await jwtVerify(jwt?.token!, localJwks);

		expect(decoded).toMatchObject({
			payload: {
				//iss: "https://example.com",
				aud: "https://example.com",
				sub: "123",
				exp: expect.any(Number),
				iat: expect.any(Number),
				custom: "custom",
			},
			protectedHeader: {
				alg: keyPairConfig.alg,
				kid: jwks.keys[0].kid,
			},
		});
		expect(decoded).not.toMatchObject({
			payload: {
				iss: "https://example.com",
			},
		});
	});

	it("shouldn't let you sign from a client", async () => {
		const client = createAuthClient({
			plugins: [jwtClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});
		const jwt = await client.$fetch("/sign-jwt", {
			method: "POST",
			body: {
				payload: { sub: "123" },
			},
		});
		expect(jwt.error?.status).toBe(404);
	});
});
