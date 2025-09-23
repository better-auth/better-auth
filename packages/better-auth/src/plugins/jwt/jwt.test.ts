import type { BetterAuthPlugin } from "..";
import type {
	CustomJwtClaims,
	JwkOptions,
	JwksOptions,
	JwtPluginOptions,
	JwtVerifyOptions,
} from "./types";
import {
	customJwtClaimsSchema,
	jwkExportedSchema,
	jwkOptionsSchema,
	JwtVerifyOptionsSchema,
} from "./types";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthEndpoint } from "..";
import { jwt } from ".";
import { jwtClient } from "./client";
import { generateExportedKeyPair, getJwk } from "./jwk";
import { signJwt } from "./sign";
import { verifyJwt, verifyJwtWithKey } from "./verify";
import {
	createLocalJWKSet,
	jwtVerify,
	type JWK,
	type JWTHeaderParameters,
	type JWTPayload,
	type JWTVerifyGetKey,
	type JWTVerifyOptions,
} from "jose";
import { describe, expect, it } from "vitest";
import z from "zod/v4";
import { parseJwk, toJwtTime } from "./utils";
import { APIError } from "../../api";

describe("jwt", async () => {
	type IsEqual<T, U> = (<G>() => G extends T ? 1 : 2) extends <
		G,
	>() => G extends U ? 1 : 2
		? true
		: false;

	type Eq1 = IsEqual<z.infer<typeof JwtVerifyOptionsSchema>, JwtVerifyOptions>;

	const typeCheck1: Eq1 = true;

	type Eq2 = IsEqual<z.infer<typeof jwkExportedSchema>, JWK>;
	const typeCheck2: Eq2 = true;

	type Eq3 = IsEqual<z.infer<typeof jwkOptionsSchema>, JwkOptions>;
	const typeCheck3: Eq3 = true;

	type Eq4 = IsEqual<z.infer<typeof customJwtClaimsSchema>, CustomJwtClaims>;
	const typeCheck4: Eq4 = true;

	function checkPayloadClaims(
		payload: JWTPayload,
		claims?: CustomJwtClaims,
		now?: number,
	) {
		if (claims?.iss === null) expect(payload.iss).toBeUndefined();
		else expect(payload.iss).toBe("http://localhost:3000"); // The only non-mutable claim

		if (claims?.aud === null) expect(payload.aud).toBeUndefined();
		else {
			if (claims?.aud) expect(payload.aud).toStrictEqual(claims.aud);
			else expect(payload.aud).toBe("http://localhost:3000");
		}

		if (claims?.exp === null) expect(payload.exp).toBeUndefined();
		else {
			expect(payload.exp).toBeTypeOf("number");
			if (claims?.exp) expect(payload.exp).toBe(toJwtTime(claims.exp, now));
		}

		if (claims?.iat === null) expect(payload.iat).toBeUndefined();
		else {
			expect(payload.iat).toBeTypeOf("number");
			if (claims?.iat) expect(payload.iat).toBe(toJwtTime(claims.iat, now));
		}

		if (claims?.jti) expect(payload.jti).toBe(claims.jti);

		if (claims?.nbf) expect(payload.nbf).toBe(toJwtTime(claims.nbf, now));

		if (claims?.sub) expect(payload.sub).toBe(claims.sub);
	}

	const { auth: testAuth } = await getTestInstance({
		plugins: [jwt()],
	});

	// Could try `beforeEach` hook if there was a way to reset the instance
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

	describe("Default settings", async () => {
		it("Client should get a token", async () => {
			const { headers, client } = await createTestCase();

			const token = await client.token({
				fetchOptions: {
					headers,
				},
			});

			expect(token.data?.token).toBeDefined();
		});

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

		it("Client should get the JWKS", async () => {
			const { auth, client } = await createTestCase();

			// If no JWK exists, this makes sure it gets added
			const jwk = await auth.api.createJwk({ body: {} });

			const jwks = await client.jwks();

			expect(jwks.data?.keys).length.above(0);
			expect(jwks.data?.keys[0].alg).toBe("EdDSA");
			expect(jwks.data?.keys[0]).toStrictEqual(jwk.key);
		});

		it("Should be able to validate signed tokens with the JWKS manually", async () => {
			const { headers, client } = await createTestCase();

			const token = await client.token({
				fetchOptions: {
					headers,
				},
			});

			const jwks = await client.jwks();

			const localJwks = createLocalJWKSet(jwks.data!);
			const { payload } = await jwtVerify(token.data?.token!, localJwks);

			checkPayloadClaims(payload);
		});

		it('Should set subject to "session.user.id" by default', async () => {
			const { headers, client } = await createTestCase();

			const token = await client.token({
				fetchOptions: {
					headers,
				},
			});

			const jwks = await client.jwks();

			const localJwks = createLocalJWKSet(jwks.data!);
			const { payload } = await jwtVerify(token.data?.token!, localJwks);

			checkPayloadClaims(payload, { sub: payload.id! as string });
		});

		it('Should set custom data if "defineSessionJwtData" is defined', async () => {
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
			const { payload } = await jwtVerify(token.data?.token!, localJwks);

			checkPayloadClaims(payload, { sub: payload.id! as string });
			expect(payload.customData).toBe("some_data");
		});

		it('Should set custom subject if "defineSessionJwtSubject" is defined', async () => {
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

		it('Should sign and verify using "/sign-jwt" and "/verify-jwt" endpoints', async () => {
			const { auth } = await createTestCase();
			const data = { field1: "data1", field2: "data2" };
			const { token } = await auth.api.signJwt({ body: { data: data } });
			const { payload } = await auth.api.verifyJwt({ body: { jwt: token } });

			expect(payload).toBeDefined();
			checkPayloadClaims(payload!);

			expect(payload?.field1).toBe("data1");
			expect(payload?.field2).toBe("data2");
		});

		it('Should sign and verify using "/sign-jwt" and "/verify-jwt" endpoints using a custom key', async () => {
			const { auth } = await createTestCase();

			const { publicKey, privateKey } = await generateExportedKeyPair();

			const data = { field1: "data1", field2: "data2" };
			const { token } = await auth.api.signJwt({
				body: { data: data, jwk: { alg: "EdDSA", ...privateKey } },
			});

			const { payload } = await auth.api.verifyJwt({
				body: { jwt: token, jwk: { alg: "EdDSA", ...publicKey } },
			});

			expect(payload).toBeDefined();
			checkPayloadClaims(payload!);
			expect(payload?.field1).toBe("data1");
			expect(payload?.field2).toBe("data2");

			// Ensure the valid key was actually used in `auth.api.signJwt` by manually veryfing JWT
			const { payload: payload2 } = await jwtVerify(token, publicKey);

			checkPayloadClaims(payload2);
			expect(payload2.field1).toBe("data1");
			expect(payload2.field2).toBe("data2");
		});
	});

	const expectedOutcomes: Record<
		string,
		{ ec: string; length: number; crv?: string; alg: string }
	> = {
		EdDSAEd25519: {
			ec: "OKP",
			length: 43,
			crv: "Ed25519",
			alg: "EdDSA",
		},
		ES256: {
			ec: "EC",
			length: 43,
			crv: "P-256",
			alg: "ES256",
		},
		ES512: {
			ec: "EC",
			length: 88,
			crv: "P-521",
			alg: "ES512",
		},
		PS256: {
			ec: "RSA",
			length: 342,
			alg: "PS256",
		},
		RS256: {
			ec: "RSA",
			length: 342,
			alg: "RS256",
		},
	};

	// Copies default `jwt` endpoints behaviour, the test is to see if they provide the same output
	const customPlugin = () => {
		return {
			id: "customJwt",
			endpoints: {
				customSignJwt: createAuthEndpoint(
					"/custom-sign",
					{
						method: "POST",
						metadata: {
							SERVER_ONLY: true,
							$Infer: {
								body: {} as {
									data: Record<string, any>;
									jwk?: string | JWK;
									claims?: CustomJwtClaims;
								},
							},
						},
						body: z.object({
							data: z.record(z.string(), z.any()),
							jwk: jwkExportedSchema.optional(),
							claims: customJwtClaimsSchema.optional(),
						}),
					},
					async (ctx) => {
						const { data, jwk, claims } = ctx.body;
						if (jwk === undefined || typeof jwk === "string") {
							const privateKey = await getJwk(ctx, true, jwk);
							const jwt = await signJwt(ctx, data, {
								jwk: privateKey,
								claims: claims,
							});
							return ctx.json({ token: jwt });
						}

						const privateKey = await parseJwk(jwk);

						const jwt = await signJwt(ctx, data, {
							jwk: privateKey,
							claims: claims,
						});

						return ctx.json({
							token: jwt,
						});
					},
				),
				customVerifyJwt: createAuthEndpoint(
					"/custom-verify",
					{
						method: "POST",
						metadata: {
							SERVER_ONLY: true,
							$Infer: {
								body: {} as {
									jwt: string;
									jwk?: JWK;
									options?: JwtVerifyOptions;
								},
							},
						},
						body: z.object({
							jwt: z.string(),
							jwk: jwkExportedSchema.optional(),
							options: JwtVerifyOptionsSchema.optional(),
						}),
					},
					async (ctx) => {
						try {
							const { jwk, jwt, options } = ctx.body;
							if (jwk) {
								if (typeof jwk === "string")
									return ctx.json({
										payload: await verifyJwtWithKey(ctx, jwt, jwk, options),
									});

								const publicKey = await parseJwk(jwk);

								return ctx.json({
									payload: await verifyJwtWithKey(ctx, jwt, publicKey, options),
								});
							}
							return ctx.json({
								payload: await verifyJwt(ctx, jwt, options),
							});
						} catch (error: unknown) {
							throw new APIError("BAD_REQUEST", {
								message:
									error instanceof APIError
										? error.message
										: `Failed to verify JWT: ${error}`,
							});
						}
					},
				),
			},
		} satisfies BetterAuthPlugin;
	};

	// Create one TestInstance to infer types
	// It needs to be done inside `describe`, so the `afterAll` clean up hook will run
	const { auth: testAuthPlugin } = await getTestInstance({
		plugins: [jwt(), customPlugin()],
	});

	const testClientPlugin = createAuthClient({
		plugins: [jwtClient()],
	});

	type TestInstancePlugin = typeof testAuthPlugin;
	type TestClientPlugin = typeof testClientPlugin;

	// Could try `beforeEach` hook if there was a way to reset the instance
	async function createPluginTestCase(jwtOptions: JwtPluginOptions): Promise<{
		auth: TestInstancePlugin;
		headers: Headers;
		client: TestClientPlugin;
	}> {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [jwt(jwtOptions), customPlugin()],
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

	describe.each([
		[false, "Private key: encrypted"],
		[true, "Private key: decrypted"],
	])("$1", async (decrypted, _) =>
		describe.each([
			{
				keyPairConfig: {
					alg: "EdDSA",
					crv: "Ed25519",
				},
				disablePrivateKeyEncryption: decrypted,
			},
			{
				keyPairConfig: {
					alg: "ES256",
				},
				disablePrivateKeyEncryption: decrypted,
			},
			{
				keyPairConfig: {
					alg: "ES512",
				},
				disablePrivateKeyEncryption: decrypted,
			},
			{
				keyPairConfig: {
					alg: "PS256",
				},
				disablePrivateKeyEncryption: decrypted,
			},
			{
				keyPairConfig: {
					alg: "RS256",
				},
				disablePrivateKeyEncryption: decrypted,
			},
		] as JwksOptions[])("Algorithm: $keyPairConfig.alg", async (jwksOpts) => {
			const pluginOpts: JwtPluginOptions = { jwks: jwksOpts };

			const expectedOutcome =
				expectedOutcomes[
					jwksOpts.keyPairConfig!.alg +
						("crv" in jwksOpts.keyPairConfig!
							? (jwksOpts.keyPairConfig!.crv ?? "")
							: "")
				];
			it("Should generate a JWK pair", async () => {
				const { auth } = await createTestCase(pluginOpts);
				// Unit test (JWS Supported key)
				const { publicKey, privateKey } = await generateExportedKeyPair(
					pluginOpts?.jwks?.keyPairConfig,
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

			it("Client should sign in", async () => {
				try {
					const { headers } = await createTestCase(pluginOpts);
					expect(headers).toBeDefined();
				} catch (err) {
					console.error(err);
					expect.unreachable();
				}
			});

			it("Client should get a token", async () => {
				const { headers, client } = await createTestCase(pluginOpts);
				const token = await client.token({
					fetchOptions: {
						headers,
					},
				});

				expect(token.data?.token).toBeDefined();
			});

			it("Client should get a token from the session", async () => {
				const { headers, client } = await createTestCase(pluginOpts);

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

			it("Should be able to validate signed tokens with the JWKS manually", async () => {
				const { headers, client } = await createTestCase(pluginOpts);

				const token = await client.token({
					fetchOptions: {
						headers,
					},
				});

				const jwks = await client.jwks();

				const localJwks = createLocalJWKSet(jwks.data!);
				const { payload } = await jwtVerify(token.data?.token!, localJwks);

				checkPayloadClaims(payload);
			});

			it("Should set subject to user id by default", async () => {
				const { headers, client } = await createTestCase(pluginOpts);
				const token = await client.token({
					fetchOptions: {
						headers,
					},
				});

				const jwks = await client.jwks();

				const localJwks = createLocalJWKSet(jwks.data!);
				const { payload } = await jwtVerify(token.data?.token!, localJwks);

				checkPayloadClaims(payload, { sub: payload.id! as string });
			});

			it('Should set custom data if "defineSessionJwtData" is defined', async () => {
				const { headers, client } = await createTestCase({
					jwks: jwksOpts,
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
				const { payload } = await jwtVerify(token.data?.token!, localJwks);

				checkPayloadClaims(payload, { sub: payload.id! as string });
				expect(payload.customData).toBe("some_data");
			});

			it('Should set custom subject if "defineSessionJwtSubject" is defined', async () => {
				const { headers, client } = await createTestCase({
					jwks: jwksOpts,
					jwt: {
						defineSessionJwtSubject: (session) => {
							return "Gollum";
						},
					},
				});
				const token = await client.token({ fetchOptions: { headers } });

				const jwks = await client.jwks();

				const localJwks = createLocalJWKSet(jwks.data!);
				const { payload } = await jwtVerify(token.data?.token!, localJwks);

				checkPayloadClaims(payload, { sub: "Gollum" });
			});

			it("Should sign JWT via default and a custom endpoint and be able to verify it", async () => {
				const { auth, client } = await createPluginTestCase(pluginOpts);
				const jwks = await client.jwks();
				const localJwks = createLocalJWKSet(jwks.data!);

				const someData = { answer: 42 };
				async function testJwtVerification(jwt: string) {
					expect(jwt.length).toBeGreaterThan(10);

					const { payload } = await auth.api.verifyJwt({
						body: { jwt },
					});

					expect(payload).toBeDefined();
					expect(payload?.answer).toBe(42);
					checkPayloadClaims(payload!);

					const { payload: payloadCustom } = await auth.api.customVerifyJwt({
						body: { jwt },
					});

					expect(payloadCustom).toStrictEqual(payload); // make sure custom plugin works the same

					const { payload: payloadManual } = await jwtVerify(jwt, localJwks);
					expect(payloadManual).toStrictEqual(payload); // make sure manual verification works the same
					expect(payloadManual).toStrictEqual(payload);
				}
				await testJwtVerification(
					(await auth.api.signJwt({ body: { data: someData } })).token,
				);
				await testJwtVerification(
					(await auth.api.customSignJwt({ body: { data: someData } })).token,
				);
			});

			async function verifyJwt(
				auth: TestInstancePlugin,
				jwt: string,
				claims: CustomJwtClaims,
				localJwks: JWTVerifyGetKey,
				now: number,
			): Promise<{
				payload: JWTPayload | null;
				payloadCustom: JWTPayload | null;
				payloadManual: JWTPayload;
				protectedHeader: JWTHeaderParameters;
			}> {
				const { payload } = await auth.api.verifyJwt({
					body: {
						jwt,
						options: {
							allowedAudiences:
								typeof claims.aud === "string"
									? [claims.aud]
									: (claims.aud ?? []),
							allowedIssuers: claims.iss === null ? [] : claims.iss,
							expectedSubject: claims.sub,
							expectedType: claims.typ === null ? undefined : claims.typ,
							maxExpirationTime:
								claims.iat && claims.exp
									? toJwtTime(claims.exp, now) - now + "s"
									: undefined,
						},
					},
				});

				const { payload: payloadCustom } = await auth.api.customVerifyJwt({
					body: {
						jwt,
						options: {
							allowedAudiences:
								typeof claims.aud === "string"
									? [claims.aud]
									: (claims.aud ?? []),
							allowedIssuers: claims.iss === null ? [] : claims.iss,
							expectedSubject: claims.sub,
							expectedType: claims.typ === null ? undefined : claims.typ,
							maxExpirationTime:
								claims.iat && claims.exp
									? toJwtTime(claims.exp, now) - now + "s"
									: undefined,
						},
					},
				});
				const { payload: payloadManual, protectedHeader } = await jwtVerify(
					jwt,
					localJwks,
					{
						audience:
							typeof claims.aud === "string"
								? [claims.aud]
								: (claims.aud ?? undefined),
						issuer: claims.iss === null ? undefined : ["http://localhost:3000"],
						maxTokenAge:
							claims.iat && claims.exp
								? toJwtTime(claims.exp, now) - now + "s"
								: undefined,
						subject: claims.sub,
						typ: claims.typ === null ? undefined : claims.typ,
					} satisfies JWTVerifyOptions,
				);
				return { payload, payloadCustom, payloadManual, protectedHeader };
			}

			it("Should sign JWT with custom claims via default and custom endpoint and be able to verify it", async () => {
				const { auth, client } = await createPluginTestCase(pluginOpts);
				const jwks = await client.jwks();
				const localJwks = createLocalJWKSet(jwks.data!);

				const someData = { answer: 42 };
				const now = Math.floor(new Date().getTime() / 1000);

				async function testJwtVerification(
					jwt: string,
					claims: CustomJwtClaims,
					errorMargin?: number,
				): Promise<JWTPayload> {
					expect(jwt.length).toBeGreaterThan(10);

					const { payload, payloadCustom, payloadManual, protectedHeader } =
						await verifyJwt(auth, jwt, claims, localJwks, now);

					expect(payload).toBeDefined();
					expect(payload?.answer).toBe(42);
					expect(payloadCustom).toStrictEqual(payload); // make sure custom plugin works the same
					expect(payloadManual).toStrictEqual(payload); // make sure manual verification works the same

					let claimsToCheck: CustomJwtClaims = {
						aud: claims.aud,
						jti: claims.jti,
						sub: claims.sub,
					};
					if (typeof payload?.exp === "string" && claims.exp) {
						expect(payload?.exp).toBeGreaterThan(
							toJwtTime(claims.exp, now) - (errorMargin ?? 60),
						);
						expect(payload?.exp).toBeLessThan(
							toJwtTime(claims.exp, now) + (errorMargin ?? 60),
						);
					} else claimsToCheck.exp = claims.exp;
					if (typeof payload?.iat === "string" && claims.iat) {
						expect(payload?.iat).toBeGreaterThan(
							toJwtTime(claims.iat, now) - (errorMargin ?? 60),
						);
						expect(payload?.iat).toBeLessThan(
							toJwtTime(claims.iat, now) + (errorMargin ?? 60),
						);
					} else claimsToCheck.iat = claims.iat;
					if (typeof payload?.nbf === "string" && claims.nbf) {
						expect(payload?.nbf).toBeGreaterThan(
							toJwtTime(claims.nbf, now) - (errorMargin ?? 60),
						);
						expect(payload?.nbf).toBeLessThan(
							toJwtTime(claims.nbf, now) + (errorMargin ?? 60),
						);
					} else claimsToCheck.nbf = claims.nbf;
					checkPayloadClaims(payload!, claimsToCheck);

					expect(protectedHeader).toMatchObject({
						typ: claims?.typ,
						alg: jwksOpts.keyPairConfig!.alg,
						kid: jwks.data!.keys[0].kid,
					});
					return payload!;
				}

				const claimsStringTime = {
					aud: "customAud",
					exp: "5 min",
					iat: "-10 s",
					jti: "customJti",
					nbf: "-2 min",
					sub: "customSub",
					typ: "customTyp",
				};
				const claimsNumberTime = {
					aud: ["customAud", "customAud2"],
					exp: now + 5 * 60,
					iat: now - 10,
					jti: "customJti",
					nbf: now - 2 * 60,
					sub: "customSub",
					typ: "customTyp",
				};
				const claimsDateTime = {
					aud: ["customAud"],
					exp: new Date(1000 * (now + 5 * 60)),
					iat: new Date(1000 * (now - 10)),
					jti: "customJti",
					nbf: new Date(1000 * (now - 2 * 60)),
					sub: "customSub",
					typ: "customTyp",
				};

				const { exp, iat, nbf, ...payload } = await testJwtVerification(
					(
						await auth.api.signJwt({
							body: {
								data: someData,
								claims: claimsStringTime,
							},
						})
					).token,
					claimsStringTime,
				);

				const {
					exp: expCustom,
					iat: iatCustom,
					nbf: nbfCustom,
					...payloadCustom
				} = await testJwtVerification(
					(
						await auth.api.customSignJwt({
							body: {
								data: someData,
								claims: claimsStringTime,
							},
						})
					).token,
					claimsStringTime,
				);

				expect(payloadCustom).toStrictEqual(payload);
				expect(Math.abs((expCustom ?? 0) - (exp ?? 0))).toBeLessThan(10);
				expect(Math.abs((iatCustom ?? 0) - (iat ?? 0))).toBeLessThan(10);
				expect(Math.abs((nbfCustom ?? 0) - (nbf ?? 0))).toBeLessThan(10);

				expect(
					await testJwtVerification(
						(
							await auth.api.signJwt({
								body: {
									data: someData,
									claims: claimsNumberTime,
								},
							})
						).token,
						claimsNumberTime,
					),
				).toStrictEqual(
					await testJwtVerification(
						(
							await auth.api.customSignJwt({
								body: {
									data: someData,
									claims: claimsNumberTime,
								},
							})
						).token,
						claimsNumberTime,
					),
				);

				expect(
					await testJwtVerification(
						(
							await auth.api.signJwt({
								body: {
									data: someData,
									claims: claimsDateTime,
								},
							})
						).token,
						claimsDateTime,
					),
				).toStrictEqual(
					await testJwtVerification(
						(
							await auth.api.customSignJwt({
								body: {
									data: someData,
									claims: claimsDateTime,
								},
							})
						).token,
						claimsDateTime,
					),
				);
			});

			it('Should sign JWT with claims removed via default (expect "exp") and custom endpoint and be able to verify it', async () => {
				const { auth, client } = await createPluginTestCase(pluginOpts);
				const jwks = await client.jwks();
				const localJwks = createLocalJWKSet(jwks.data!);

				const someData = { answer: 42 };
				const now = Math.floor(new Date().getTime() / 1000);

				async function testJwtVerification(
					jwt: string,
					claims: CustomJwtClaims,
				): Promise<JWTPayload> {
					expect(jwt.length).toBeGreaterThan(10);

					const { payload, payloadCustom, payloadManual } = await verifyJwt(
						auth,
						jwt,
						claims,
						localJwks,
						now,
					);

					expect(payload).toBeDefined();
					expect(payload?.answer).toBe(42);
					checkPayloadClaims(payload!, claims);
					expect(payloadCustom).toStrictEqual(payload); // make sure custom plugin works the same
					expect(payloadManual).toStrictEqual(payload); // make sure manual verification works the same

					return payload!;
				}

				const claimsExpOnly: CustomJwtClaims = {
					aud: null,
					iat: null,
					iss: null,
					exp: now + 5 * 60,
				};

				expect(
					await testJwtVerification(
						(
							await auth.api.signJwt({
								body: {
									data: someData,
									claims: claimsExpOnly,
								},
							})
						).token,
						claimsExpOnly,
					),
				).toStrictEqual(
					await testJwtVerification(
						(
							await auth.api.customSignJwt({
								body: {
									data: someData,
									claims: claimsExpOnly,
								},
							})
						).token,
						claimsExpOnly,
					),
				);

				const claimsEmpty: CustomJwtClaims = {
					aud: null,
					iat: null,
					iss: null,
					exp: null,
					typ: null,
				};

				expect(
					auth.api.signJwt({
						body: {
							data: someData,
							claims: claimsEmpty,
						},
					}),
				).rejects.toThrow(
					'Failed to sign the JWT: Tokens without "Expiration Time" Claim are not allowed, because they are dangerous. If you are sure you want to create such tokens, create your own endpoint',
				);

				const jwt = (
					await auth.api.customSignJwt({
						body: {
							data: someData,
							claims: claimsEmpty,
						},
					})
				).token;
				expect(jwt.length).toBeGreaterThan(10);

				expect(
					auth.api.verifyJwt({
						body: {
							jwt,
							options: {
								allowedAudiences: [],
								allowedIssuers: [],
								expectedType: "",
							},
						},
					}),
				).rejects.toThrow(
					'Failed to verify the JWT: Tokens without "Expiration Time" Claim are not allowed, because they are dangerous. If you are sure you want to verify such tokens, create your own endpoint',
				);

				const { payload: payloadCustom } = await auth.api.customVerifyJwt({
					body: {
						jwt,
						options: {
							allowedAudiences: [],
							allowedIssuers: [],
							expectedType: "",
						},
					},
				});
				expect(payloadCustom).toBeDefined();
				expect(payloadCustom?.answer).toBe(42);
				checkPayloadClaims(payloadCustom!, claimsEmpty);

				const { payload: payloadManual, protectedHeader } = await jwtVerify(
					jwt,
					localJwks,
				);
				expect(payloadManual).toStrictEqual(payloadCustom); // make sure manual verification works the same
				expect(protectedHeader.typ).toBeUndefined();
			});

			it("Should verify JWT with different key from the database ", async () => {});

			it("Should verify JWT with external key from the database ", async () => {});

			it("Should verify JWT from external systems", async () => {});

			it("Should fail to verify JWT with invalid claims", async () => {});

			it("Should fail to sign JWT with default endpoint when no exp claim", async () => {});

			it("Should revoke JWK and be unable to use it", async () => {});

			//todo: test what happens when NaN is passed to iat, exp etc.

			it("Should drop claims from data when signing JWT", async () => {
				const { auth } = await createTestCase(pluginOpts);
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
				const { payload } = await auth.api.verifyJwt({
					body: { jwt: jwt?.token },
				});
				expect(payload).toBeDefined();
				// Should detect default claims, because the claims from the data were removed
				checkPayloadClaims(payload!);
				// But the data should remain
				expect(payload?.custom).toBe("custom");
			});

			it("Shouldn't let client use any server-only endpoints", async () => {
				const { client } = await createTestCase(pluginOpts);

				const verifyJwt = await client.$fetch("/verify-jwt", {
					method: "POST",
					body: {
						data: {
							jwt: "123",
						},
					},
				});
				expect(verifyJwt.error?.status).toBe(404);

				const signJwt = await client.$fetch("/sign-jwt", {
					method: "POST",
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
				expect(signJwt.error?.status).toBe(404);

				const revokeJwt = await client.$fetch("/revoke-jwt", {
					method: "POST",
					body: {
						jti: "123",
					},
				});
				expect(revokeJwt.error?.status).toBe(404);

				const createJwk = await client.$fetch("/create-jwk", {
					method: "POST",
				});
				expect(createJwk.error?.status).toBe(404);

				const importJwk = await client.$fetch("/import-jwk", {
					method: "POST",
					body: {
						jwk: { alg: "EdDSA" },
					},
				});
				expect(importJwk.error?.status).toBe(404);

				const revokeJwk = await client.$fetch("/revoke-jwk", {
					method: "POST",
					body: {
						keyId: "123",
					},
				});
				expect(revokeJwk.error?.status).toBe(404);
			});
		}),
	);
});
