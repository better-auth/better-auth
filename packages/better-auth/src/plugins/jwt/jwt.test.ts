import type { BetterAuthPlugin } from "@better-auth/core";
import type {
	JwtCustomClaims,
	JwkOptions,
	JwtPluginOptions,
	JwtVerifyOptions,
} from "./types";
import {
	jwtCustomClaimsSchema,
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
import { verifyJwt as verJwt, verifyJwtWithKey } from "./verify";
import {
	createLocalJWKSet,
	jwtVerify,
	SignJWT,
	type JSONWebKeySet,
	type JWK,
	type JWTHeaderParameters,
	type JWTPayload,
	type JWTVerifyGetKey,
	type JWTVerifyOptions,
} from "jose";
import { describe, expect, it } from "vitest";
import z from "zod/v4";
import {
	isPrivateKeyEncrypted,
	parseJwk,
	revokedTag,
	toJwtTime,
} from "./utils";
import { APIError } from "../../api";
import { BetterAuthError } from "@better-auth/core/error";
import { getJwksAdapter } from "./adapter";
import { JWTExpired } from "jose/errors";
import { randomUUID } from "crypto";
import type { Awaitable } from "../../types/helper";

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

	type Eq4 = IsEqual<z.infer<typeof jwtCustomClaimsSchema>, JwtCustomClaims>;
	const typeCheck4: Eq4 = true;

	async function createRemoteKey(pluginOpts?: JwtPluginOptions): Promise<JWK> {
		const { privateKey } = await generateExportedKeyPair();
		privateKey.kid = randomUUID();

		return privateKey;
	}

	const remoteKeys: JWK[] = [await createRemoteKey()];
	const remoteKeys2: JWK[] = [];
	const remoteKeys3: JWK[] = [
		await createRemoteKey(),
		await createRemoteKey(),
		await createRemoteKey(),
	];

	const remoteJwks: (() => Awaitable<JSONWebKeySet>)[] = [
		() => {
			return { keys: remoteKeys };
		},
		() => {
			return { keys: remoteKeys2 };
		},
		() => {
			return { keys: remoteKeys3 };
		},
	];

	function checkPayloadClaims(
		payload: JWTPayload,
		claims?: JwtCustomClaims,
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
			remoteJwks,
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
									claims?: JwtCustomClaims;
								},
							},
						},
						/*body: z.object({
							data: z.record(z.string(), z.any()),
							jwk: jwkExportedSchema.or(z.string()).optional(),
							claims: jwtCustomClaimsSchema.optional(),
						}),*/
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
									jwk?: string | JWK;
									options?: JwtVerifyOptions;
								},
							},
						},
						/*body: z.object({
							jwt: z.string(),
							jwk: jwkExportedSchema.or(z.string()).optional(),
							options: JwtVerifyOptionsSchema.optional(),
						}),*/
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
								payload: await verJwt(ctx, jwt, options),
							});
						} catch (error: unknown) {
							if (error instanceof JWTExpired)
								throw new APIError("BAD_REQUEST", {
									message: "Failed to verify the JWT: the token has expired",
								});
							throw new APIError("BAD_REQUEST", {
								message: "Failed to verify the JWT",
							});
						}
					},
				),
			},
		} satisfies BetterAuthPlugin;
	};

	const unsafePlugin = () => {
		return {
			id: "wrongPlugin",
			endpoints: {
				reencrypt: createAuthEndpoint(
					"/re-encrypt",
					{
						method: "POST",
						metadata: {
							SERVER_ONLY: true,
							$Infer: {
								body: {} as {
									decrypted: boolean;
								},
							},
						},
						body: z.object({
							decrypted: z.boolean(),
						}),
					},
					async (ctx) => {
						const { decrypted } = ctx.body;
						await getJwksAdapter(ctx.context.adapter).updateKeysEncryption(
							ctx.context.secret,
							decrypted,
						);
					},
				),
				getAllKeys: createAuthEndpoint(
					"/all-keys",
					{
						method: "GET",
						metadata: {
							SERVER_ONLY: true,
						},
					},
					async (ctx) => {
						return ctx.json({
							keys: await getJwksAdapter(ctx.context.adapter).getAllKeys(),
						});
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
	async function createPluginTestCase(jwtOptions?: JwtPluginOptions): Promise<{
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

	async function verifyJwt(
		auth: TestInstancePlugin,
		jwt: string,
		claims: JwtCustomClaims,
		optional?: {
			now?: number;
			jwk?: string | JWK;
			localJwks?: JWTVerifyGetKey;
			options?: JwtVerifyOptions; // Setting the options to null forces defaults, so we can test them
		},
	): Promise<{
		payload: JWTPayload | null;
		payloadCustom: JWTPayload | null;
		payloadManual: JWTPayload;
		protectedHeader: JWTHeaderParameters;
	}> {
		const nowSeconds: number = optional?.now ?? Math.floor(Date.now() / 1000);

		const verifyOptions: JwtVerifyOptions = {
			allowedAudiences:
				typeof claims.aud === "string" ? [claims.aud] : claims.aud,
			allowedIssuers: claims.iss,
			expectedSubject: claims.sub,
			expectedType: claims.typ,
			maxTokenAge:
				claims.iat && claims.exp
					? toJwtTime(claims.exp, nowSeconds) - nowSeconds + "s"
					: undefined,
			...optional?.options,
		};

		const { payload } = await auth.api.verifyJwt({
			body: {
				jwt: jwt,
				jwk: optional?.jwk,
				options: verifyOptions,
			},
		});

		const { payload: payloadCustom } = await auth.api.customVerifyJwt({
			body: {
				jwt: jwt,
				jwk: optional?.jwk,
				options: verifyOptions,
			},
		});

		const parsedOptions: JWTVerifyOptions = {
			audience:
				verifyOptions.allowedAudiences === null
					? undefined
					: verifyOptions.allowedAudiences,
			issuer:
				verifyOptions.allowedIssuers === null
					? undefined
					: verifyOptions.allowedIssuers,
			maxTokenAge:
				verifyOptions.maxTokenAge === null
					? undefined
					: verifyOptions.maxTokenAge,
			subject: verifyOptions.expectedSubject,
			clockTolerance:
				verifyOptions.maxClockSkew === null
					? undefined
					: (verifyOptions.maxClockSkew ?? 30),
			typ:
				verifyOptions.expectedType === null
					? undefined
					: verifyOptions.expectedType,
		};

		if (!optional?.jwk || typeof optional?.jwk === "string") {
			if (!optional?.localJwks)
				throw new BetterAuthError(
					"`localJWKS` is undefined and `jwk` is not provided or provided as key ID. Cannot find the key for manual verification without JWKS to search in",
				);
			const { payload: payloadManual, protectedHeader } = await jwtVerify(
				jwt,
				optional?.localJwks,
				parsedOptions,
			);
			return {
				payload,
				payloadCustom,
				payloadManual,
				protectedHeader,
			};
		}

		const { payload: payloadManual, protectedHeader } = await jwtVerify(
			jwt,
			optional?.jwk as JWK,
			parsedOptions,
		);
		return {
			payload,
			payloadCustom,
			payloadManual,
			protectedHeader,
		};
	}

	const allAlgorithms: JwkOptions[] = [
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
	];

	function randomAlgorithm(): JwkOptions {
		return allAlgorithms[Math.floor(Math.random() * allAlgorithms.length)]!;
	}

	// Testing
	it("Shouldn't let client use any server-only endpoints", async () => {
		const { client } = await createTestCase();

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
	describe.each([
		[false, "Private key: encrypted"],
		[true, "Private key: decrypted"],
	])(
		"$1",
		async (disablePrivateKeyEncryption, _): Promise<void> =>
			describe.each([
				[false, "Cache: enabled"],
				[true, "Cache: disabled"],
			])("$1", async (disableJwksCaching, _): Promise<void> => {
				function simplePluginOpts(
					defaultKeyId?: string,
					remoteJwks?: (() => Awaitable<JSONWebKeySet>)[],
				) {
					return {
						jwks: {
							keyPairConfig: randomAlgorithm(),
							disablePrivateKeyEncryption,
							disableJwksCaching,
							defaultKeyId,
							remoteJwks,
						},
					} satisfies JwtPluginOptions;
				}

				it("Should import JWK without ID", async () => {
					const { auth } = await createTestCase(simplePluginOpts()); // Should not depend on {`jwtPluginOptions`}, but randomize it anyways

					const { privateKey } = await generateExportedKeyPair(
						randomAlgorithm(),
					);
					privateKey.kid = undefined; // Make sure

					const id: string = (
						await auth.api.importJwk({ body: { jwk: privateKey } })
					).key.id;
					expect(id).toBeDefined();
					expect(
						(await auth.api.importJwk({ body: { jwk: privateKey } })).key.id,
					).not.toBe(id); // Should be able to import a key without id multiple times
				});

				it("Should fail to import JWK with the same ID", async () => {
					const { auth } = await createTestCase(simplePluginOpts());

					const customKeyId: string = "custom";
					const { privateKey } = await generateExportedKeyPair(
						randomAlgorithm(),
					);
					privateKey.kid = customKeyId;

					expect(
						await auth.api.importJwk({ body: { jwk: privateKey } }),
					).toMatchObject({ key: { id: customKeyId } });
					await expect(
						auth.api.importJwk({ body: { jwk: privateKey } }),
					).rejects.toThrow(
						'Failed to import JWK: ID "custom" already exists in the database',
					);
				});

				it("Should fail to import a key that has been revoked", async () => {
					const { auth, client } = await createTestCase(simplePluginOpts());

					const customKeyId: string = "custom";
					const { privateKey } = await generateExportedKeyPair(
						randomAlgorithm(),
					);
					privateKey.kid = customKeyId;

					expect(
						await auth.api.importJwk({ body: { jwk: privateKey } }),
					).toMatchObject({ key: { id: customKeyId } });

					await auth.api.revokeJwk({ body: { keyId: customKeyId } });
					const jwks = await client.jwks();

					expect(jwks.data?.keys[0]).toBeDefined();
					expect(jwks.data!.keys[0]?.kid).not.toBe(customKeyId);
					await expect(
						auth.api.importJwk({ body: { jwk: privateKey } }),
					).rejects.toThrow(
						'Failed to import JWK: ID "custom" has already been revoked!',
					);
				});

				it("Should import a public JWK and be unable to sign with it", async () => {
					const { auth } = await createTestCase(simplePluginOpts()); // Should not depend on {`jwtPluginOptions`}, but randomize it anyways

					const customKeyId: string = "custom";
					const { publicKey } = await generateExportedKeyPair(
						randomAlgorithm(),
					);
					publicKey.kid = customKeyId;

					await auth.api.importJwk({ body: { jwk: publicKey } });
					await expect(
						auth.api.signJwt({
							body: { data: { someData: "some" }, jwk: customKeyId },
						}),
					).rejects.toThrow(
						'Failed to access the JWK: Tried to access a private key from a public-only entry with ID "custom"',
					);
				});

				it("Should use default key id", async () => {
					const { auth, headers, client } = await createTestCase(
						simplePluginOpts("custom"),
					); // Should not depend on {`jwtPluginOptions`}, but randomize it anyways

					await auth.api.createJwk(); // So the first key is not the custom one

					const customKeyId: string = "custom";
					const { privateKey } = await generateExportedKeyPair(
						randomAlgorithm(),
					);
					privateKey.kid = customKeyId;

					expect(
						await auth.api.importJwk({ body: { jwk: privateKey } }),
					).toMatchObject({ key: { id: customKeyId } });

					await auth.api.createJwk(); // So the last key is not the custom one

					const token = (await client.token({ fetchOptions: { headers } })).data
						?.token;
					expect(token?.length).toBeGreaterThan(10);

					const jwks = await client.jwks();
					expect(jwks.data).toBeDefined();
					const localJwks = createLocalJWKSet(jwks.data!);
					const { protectedHeader } = await jwtVerify(token!, localJwks);
					expect(protectedHeader.kid).toBe(customKeyId);
				});

				it("Should use default key id even if it is a remote key", async () => {
					const remoteKid = remoteKeys3[1]!.kid!;
					const { headers, client } = await createTestCase({
						jwks: { ...simplePluginOpts(remoteKid, remoteJwks).jwks },
					});

					const token = (await client.token({ fetchOptions: { headers } })).data
						?.token;
					expect(token?.length).toBeGreaterThan(10);

					const jwks = await client.jwksAll();
					expect(jwks.data).toBeDefined();
					const localJwks = createLocalJWKSet(jwks.data!);
					const { protectedHeader } = await jwtVerify(token!, localJwks);
					expect(protectedHeader.kid).toBe(remoteKid);
				});

				it(`Private keys should be ${disablePrivateKeyEncryption ? "decrypted" : "encrypted"} and re-${disablePrivateKeyEncryption ? "encrypt" : "decrypt"}able`, async () => {
					const { auth } = await getTestInstance({
						plugins: [jwt(simplePluginOpts()), unsafePlugin()],
						logger: {
							level: "error",
						},
					});
					await auth.api.getJwks(); // Creates a default one
					await auth.api.createJwk();
					await auth.api.createJwk({
						body: { jwkOptions: { alg: "ES512" } },
					});

					const customKeyId: string = "custom";
					const { privateKey } = await generateExportedKeyPair(
						randomAlgorithm(),
					);
					privateKey.kid = customKeyId;

					await auth.api.importJwk({ body: { jwk: privateKey } });
					const keys = (await auth.api.getAllKeys())?.keys ?? [];
					expect(keys.length).toBe(4);
					for (const key of keys)
						expect(isPrivateKeyEncrypted(key.privateKey)).toBe(
							!disablePrivateKeyEncryption,
						);

					await auth.api.reencrypt({
						body: { decrypted: !disablePrivateKeyEncryption },
					});

					const newKeys = (await auth.api.getAllKeys())?.keys ?? [];
					expect(newKeys.length).toBe(4);
					for (const key of newKeys)
						expect(isPrivateKeyEncrypted(key.privateKey)).toBe(
							disablePrivateKeyEncryption,
						);
				});

				it("Should verify the JWT with external JOSE key", async () => {
					const { auth } = await createPluginTestCase({
						jwks: {
							keyPairConfig:
								allAlgorithms[Math.floor(Math.random() * allAlgorithms.length)],
						},
					});

					const someData = { answer: 42 };
					const now = Math.floor(Date.now() / 1000);

					const customKeyId: string = "custom";
					const keyAlgorithm =
						allAlgorithms[Math.floor(Math.random() * allAlgorithms.length)];

					const { publicKey, privateKey } =
						await generateExportedKeyPair(keyAlgorithm);
					publicKey.kid = customKeyId;
					privateKey.kid = customKeyId;

					async function testJwtVerification(
						jwt: string,
						claims: JwtCustomClaims,
					): Promise<JWTPayload> {
						expect(jwt.length).toBeGreaterThan(10);

						const { payload, payloadCustom, payloadManual, protectedHeader } =
							await verifyJwt(auth, jwt, claims, {
								now,
								jwk: publicKey,
							});

						expect(payload).toBeDefined();
						expect(payload?.answer).toBe(someData.answer);
						expect(payloadCustom).toStrictEqual(payload); // Make sure custom plugin works the same
						expect(payloadManual).toStrictEqual(payload); // Make sure manual verification works the same

						checkPayloadClaims(payload!, claims);

						expect(protectedHeader).toMatchObject({
							typ: claims?.typ,
							alg: keyAlgorithm?.alg ?? "EdDSA",
							kid: customKeyId,
						});
						return payload!;
					}

					const claims: JwtCustomClaims = {
						aud: ["customAud", "customAud2"],
						exp: now + 5 * 60,
						iat: now - 10,
						jti: "customJti",
						nbf: now - 2 * 60,
						sub: "customSub",
						typ: "customTyp",
					};

					expect(
						await testJwtVerification(
							(
								await auth.api.signJwt({
									body: {
										data: someData,
										jwk: privateKey,
										claims: claims,
									},
								})
							).token,
							claims,
						),
					).toStrictEqual(
						await testJwtVerification(
							(
								await auth.api.customSignJwt({
									body: {
										data: someData,
										jwk: privateKey,
										claims: claims,
									},
								})
							).token,
							claims,
						),
					);
				});

				describe.each([
					{
						alg: "Default Settings",
					},
					...allAlgorithms,
				] as (JwkOptions | { alg: "Default Settings" })[])(
					"Algorithm: $alg",
					async (keyPairConfig) => {
						let pluginOpts: JwtPluginOptions | undefined = undefined;
						if (keyPairConfig.alg === "Default Settings") {
							if (disablePrivateKeyEncryption)
								pluginOpts = { jwks: { disablePrivateKeyEncryption } };

							if (disableJwksCaching)
								pluginOpts = {
									jwks: { ...pluginOpts?.jwks, disableJwksCaching },
								};
						} else
							pluginOpts = {
								jwks: {
									keyPairConfig,
									disablePrivateKeyEncryption,
									disableJwksCaching,
								},
							};

						const expectedOutcome =
							expectedOutcomes[
								keyPairConfig!.alg === "Default Settings"
									? "EdDSAEd25519"
									: keyPairConfig!.alg +
										("crv" in keyPairConfig! ? (keyPairConfig!.crv ?? "") : "")
							];

						function checkKey(key: JWK, isAlgNecessary?: boolean) {
							expect(key.kty).toBe(expectedOutcome!.ec);
							if (key.crv) expect(key.crv).toBe(expectedOutcome!.crv);
							if (key.alg || isAlgNecessary)
								expect(key.alg).toBe(expectedOutcome!.alg);
							if (key.x) expect(key.x).toHaveLength(expectedOutcome!.length);
							if (key.y) expect(key.y).toHaveLength(expectedOutcome!.length);
							if (key.n) expect(key.n).toHaveLength(expectedOutcome!.length);
						}

						it("Should generate a JWK pair", async () => {
							expect(expectedOutcome).toBeDefined();

							const { auth } = await createTestCase(pluginOpts);

							// Unit test (JWS Supported key)
							const { publicKey, privateKey } = await generateExportedKeyPair(
								pluginOpts?.jwks?.keyPairConfig,
							);

							for (const key of [publicKey, privateKey]) {
								expect(key).toBeDefined();
								checkKey(key!);
							}

							// Functional test (JWKS)
							const jwks = await auth.api.getJwks();
							expect(jwks.keys[0]).toBeDefined();
							checkKey(jwks.keys[0]!, true);

							// The key generated by `createJwk` should pass the checks too
							const jwk = (await auth.api.createJwk()).jwk as JWK;
							expect(jwk).toBeDefined();
							expect(jwk.kid!).toBe((await auth.api.getJwks()).keys[1]!.kid);
							checkKey(jwk, true);
						});

						it("Create key should create a proper key", async () => {
							const { auth } = await createTestCase(); // Do not pass pluginOpts, to test if the key is not created by the default rules

							const jwk = (
								await auth.api.createJwk({
									body: { jwkOptions: pluginOpts?.jwks?.keyPairConfig },
								})
							).jwk as JWK;
							expect(jwk).toBeDefined();
							checkKey(jwk, true);
						});

						it("Client should get a token", async () => {
							try {
								const { headers, client } = await createTestCase(pluginOpts);
								const token = await client.token({
									fetchOptions: {
										headers,
									},
								});
								expect(token.data?.token.length).toBeGreaterThan(10);
							} catch (err) {
								console.error(err);
								expect.unreachable();
							}
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

						it("Client should get the JWKS", async () => {
							const { auth, client } = await createTestCase(pluginOpts);

							// A key should be created by default
							let jwks = await client.jwks();

							expect(jwks.data).toBeDefined();
							expect(jwks.data!.keys.length).toBe(1);
							const firstKey = jwks.data!.keys[0]!;
							expect(firstKey.alg).toBe(
								pluginOpts?.jwks?.keyPairConfig?.alg ?? "EdDSA",
							);

							// Add a new key for tests
							const jwk = (await auth.api.createJwk()).jwk as JWK;
							jwks = await client.jwks();
							expect(jwks.data!.keys.length).toBe(2);
							expect(jwks.data!.keys[1]).toStrictEqual(jwk);

							const allJwks = await client.jwksAll();

							expect(allJwks.data!.keys.length).toBeGreaterThan(1);
							expect(
								allJwks.data!.keys.find((key) => {
									return key.kid === firstKey.kid;
								}),
							).toStrictEqual(firstKey);
							expect(
								allJwks.data!.keys.find((key) => {
									return key.kid === jwk.kid;
								}),
							).toStrictEqual(jwk);
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
							const { payload } = await jwtVerify(
								token.data?.token!,
								localJwks,
							);

							checkPayloadClaims(payload, { sub: payload.id! as string });
						});

						it('Should set custom data if "defineSessionJwtData" is defined', async () => {
							const { headers, client } = await createTestCase({
								...pluginOpts,
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
							const { payload } = await jwtVerify(
								token.data?.token!,
								localJwks,
							);

							checkPayloadClaims(payload, { sub: payload.id! as string });
							expect(payload.customData).toBe("some_data");
						});

						it('Should set custom subject if "defineSessionJwtSubject" is defined', async () => {
							const { headers, client } = await createTestCase({
								...pluginOpts,
								jwt: {
									defineSessionJwtSubject: (session) => {
										return "Gollum";
									},
								},
							});
							const token = await client.token({ fetchOptions: { headers } });

							const jwks = await client.jwks();

							const localJwks = createLocalJWKSet(jwks.data!);
							const { payload } = await jwtVerify(
								token.data?.token!,
								localJwks,
							);

							checkPayloadClaims(payload, { sub: "Gollum" });
						});

						describe("Default and custom plugins' endpoints", async () => {
							it("Should sign JWT and verify it", async () => {
								const { auth, client } = await createPluginTestCase(pluginOpts);
								const jwks = await client.jwks();
								const localJwks = createLocalJWKSet(jwks.data!);

								const someData = { answer: 42 };
								async function testJwtVerification(
									jwt: string,
								): Promise<JWTPayload> {
									expect(jwt.length).toBeGreaterThan(10);

									const { payload } = await auth.api.verifyJwt({
										body: { jwt },
									});

									expect(payload).toBeDefined();
									expect(payload!.answer).toBe(someData.answer);
									checkPayloadClaims(payload!);

									const { payload: payloadCustom } =
										await auth.api.customVerifyJwt({
											body: { jwt },
										});

									const { exp, iat, ...restOfPayload } = payload!;
									expect(payloadCustom).toMatchObject(restOfPayload); // make sure custom plugin works the same
									expect(
										Math.abs((exp ?? 0) - (payloadCustom?.exp ?? 100)),
									).toBeLessThan(10);
									expect(
										Math.abs((exp ?? 0) - (payloadCustom?.exp ?? 100)),
									).toBeLessThan(10);

									const { payload: payloadManual } = await jwtVerify(
										jwt,
										localJwks,
									);
									expect(payloadManual).toMatchObject(restOfPayload); // make sure manual verification works the same
									expect(
										Math.abs((exp ?? 0) - (payloadManual?.exp ?? 100)),
									).toBeLessThan(10);
									expect(
										Math.abs((exp ?? 0) - (payloadManual?.exp ?? 100)),
									).toBeLessThan(10);
									return payload!;
								}
								const { exp, iat, ...restOfPayload } =
									await testJwtVerification(
										(await auth.api.signJwt({ body: { data: someData } }))
											.token,
									);
								const payloadCustom = await testJwtVerification(
									(await auth.api.customSignJwt({ body: { data: someData } }))
										.token,
								);
								expect(payloadCustom).toMatchObject(restOfPayload);
								expect(
									Math.abs((exp ?? 0) - (payloadCustom?.exp ?? 100)),
								).toBeLessThan(10);
								expect(
									Math.abs((exp ?? 0) - (payloadCustom?.exp ?? 100)),
								).toBeLessThan(10);
							});

							it("Should sign JWT with custom claims and verify it", async () => {
								const { auth, client } = await createPluginTestCase(pluginOpts);
								const jwks = await client.jwks();
								const localJwks = createLocalJWKSet(jwks.data!);

								const someData = { answer: 42 };
								const now = Math.floor(Date.now() / 1000);

								async function testJwtVerification(
									jwt: string,
									claims: JwtCustomClaims,
									errorMargin?: number,
								): Promise<JWTPayload> {
									expect(jwt.length).toBeGreaterThan(10);

									const {
										payload,
										payloadCustom,
										payloadManual,
										protectedHeader,
									} = await verifyJwt(auth, jwt, claims, { now, localJwks });

									expect(payload).toBeDefined();
									expect(payload?.answer).toBe(someData.answer);
									expect(payloadCustom).toStrictEqual(payload); // make sure custom plugin works the same
									expect(payloadManual).toStrictEqual(payload); // make sure manual verification works the same

									let claimsToCheck: JwtCustomClaims = {
										aud: claims.aud,
										jti: claims.jti,
										sub: claims.sub,
									};
									if (typeof claims?.exp === "string") {
										expect(payload!.exp).toBeGreaterThan(
											toJwtTime(claims.exp, now) - (errorMargin ?? 10),
										);
										expect(payload!.exp).toBeLessThan(
											toJwtTime(claims.exp, now) + (errorMargin ?? 10),
										);
									} else claimsToCheck.exp = claims.exp;
									if (typeof claims?.iat === "string") {
										expect(payload!.iat).toBeGreaterThan(
											toJwtTime(claims.iat, now) - (errorMargin ?? 10),
										);
										expect(payload!.iat).toBeLessThan(
											toJwtTime(claims.iat, now) + (errorMargin ?? 10),
										);
									} else claimsToCheck.iat = claims.iat;
									if (typeof claims?.nbf === "string") {
										expect(payload!.nbf).toBeGreaterThan(
											toJwtTime(claims.nbf, now) - (errorMargin ?? 10),
										);
										expect(payload!.nbf).toBeLessThan(
											toJwtTime(claims.nbf, now) + (errorMargin ?? 10),
										);
									} else claimsToCheck.nbf = claims.nbf;
									checkPayloadClaims(payload!, claimsToCheck);

									expect(protectedHeader).toMatchObject({
										typ: claims?.typ,
										alg: pluginOpts?.jwks?.keyPairConfig?.alg ?? "EdDSA",
										kid: jwks.data!.keys[0]!.kid,
									});
									return payload!;
								}

								const claimsStringTime: JwtCustomClaims = {
									aud: "customAud",
									exp: "5 min",
									iat: "-10 s",
									jti: "customJti",
									nbf: "-2 min",
									sub: "customSub",
									typ: "customTyp",
								};
								const claimsNumberTime: JwtCustomClaims = {
									aud: ["customAud", "customAud2"],
									exp: now + 5 * 60,
									iat: now - 10,
									jti: "customJti",
									nbf: now - 2 * 60,
									sub: "customSub",
									typ: "customTyp",
								};
								const claimsDateTime: JwtCustomClaims = {
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
								expect(Math.abs((expCustom ?? 0) - (exp ?? 0))).toBeLessThan(
									10,
								);
								expect(Math.abs((iatCustom ?? 0) - (iat ?? 0))).toBeLessThan(
									10,
								);
								expect(Math.abs((nbfCustom ?? 0) - (nbf ?? 0))).toBeLessThan(
									10,
								);

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

							it("Should sign JWT with claims removed and verify it", async () => {
								const { auth, client } = await createPluginTestCase(pluginOpts);
								const jwks = await client.jwks();
								const localJwks = createLocalJWKSet(jwks.data!);

								const someData = { answer: 42 };
								const now = Math.floor(Date.now() / 1000);

								async function testJwtVerification(
									jwt: string,
									claims: JwtCustomClaims,
								): Promise<JWTPayload> {
									expect(jwt.length).toBeGreaterThan(10);

									const { payload, payloadCustom, payloadManual } =
										await verifyJwt(auth, jwt, claims, {
											now,
											localJwks,
											options: { requiredClaims: null },
										});

									expect(payload).toBeDefined();
									expect(payload?.answer).toBe(someData.answer);
									checkPayloadClaims(payload!, claims);
									expect(payloadCustom).toStrictEqual(payload); // make sure custom plugin works the same
									expect(payloadManual).toStrictEqual(payload); // make sure manual verification works the same

									return payload!;
								}

								const claimsExpOnly: JwtCustomClaims = {
									aud: null,
									exp: now + 5 * 60,
									iat: null,
									iss: null,
									typ: null,
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

								const claimsEmpty: JwtCustomClaims = {
									aud: null,
									exp: null,
									iat: null,
									iss: null,
									typ: null,
								};

								await expect(
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

								await expect(
									auth.api.verifyJwt({
										body: {
											jwt,
											options: {
												allowedAudiences: null,
												allowedIssuers: null,
												expectedType: null,
												requiredClaims: null,
											},
										},
									}),
								).rejects.toThrow(
									'Failed to verify the JWT: Tokens without "Expiration Time" Claim are not allowed, because they are dangerous. If you are sure you want to verify such tokens, create your own endpoint',
								);

								const { payload: payloadCustom } =
									await auth.api.customVerifyJwt({
										body: {
											jwt,
											// Empty literals work the same as passing nulls
											options: {
												allowedAudiences: [],
												allowedIssuers: [],
												expectedType: "",
												requiredClaims: [],
											},
										},
									});
								expect(payloadCustom).toBeDefined();
								expect(payloadCustom?.answer).toBe(someData.answer);
								checkPayloadClaims(payloadCustom!, claimsEmpty);

								const { payload: payloadManual, protectedHeader } =
									await jwtVerify(jwt, localJwks);
								expect(payloadManual).toStrictEqual(payloadCustom); // make sure manual verification works the same
								expect(protectedHeader.typ).toBeUndefined();
							});

							it("Should verify the JWT with a different JWK from the database", async () => {
								const { auth, client } = await createPluginTestCase(pluginOpts);
								const jwk = (await auth.api.createJwk()).jwk as JWK;

								// Create second key, it becomes the default key
								await auth.api.createJwk();
								const jwks = await client.jwks();
								expect(jwks.data?.keys?.length).above(1);
								const localJwks = createLocalJWKSet(jwks.data!);

								const someData = { answer: 42 };
								const now = Math.floor(Date.now() / 1000);

								async function testJwtVerification(
									jwt: string,
									jwk: string,
									claims: JwtCustomClaims,
								): Promise<JWTPayload> {
									expect(jwt.length).toBeGreaterThan(10);

									const {
										payload,
										payloadCustom,
										payloadManual,
										protectedHeader,
									} = await verifyJwt(auth, jwt, claims, {
										now,
										jwk,
										localJwks,
									});

									expect(payload).toBeDefined();
									expect(payload?.answer).toBe(someData.answer);
									expect(payloadCustom).toStrictEqual(payload); // make sure custom plugin works the same
									expect(payloadManual).toStrictEqual(payload); // make sure manual verification works the same

									checkPayloadClaims(payload!, claims);

									expect(protectedHeader).toMatchObject({
										typ: claims?.typ,
										alg: pluginOpts?.jwks?.keyPairConfig?.alg ?? "EdDSA",
										kid: jwk,
									});
									return payload!;
								}

								const claims: JwtCustomClaims = {
									aud: ["customAud", "customAud2"],
									exp: now + 5 * 60,
									iat: now - 10,
									jti: "customJti",
									nbf: now - 2 * 60,
									sub: "customSub",
									typ: "customTyp",
								};

								expect(jwk.kid).toBeDefined();
								expect(
									await testJwtVerification(
										(
											await auth.api.signJwt({
												body: {
													data: someData,
													jwk: jwk.kid!,
													claims: claims,
												},
											})
										).token,
										jwk.kid!,
										claims,
									),
								).toStrictEqual(
									await testJwtVerification(
										(
											await auth.api.customSignJwt({
												body: {
													data: someData,
													jwk: jwk.kid!,
													claims: claims,
												},
											})
										).token,
										jwk.kid!,
										claims,
									),
								);
							});

							it("Should verify the JWT from external systems", async () => {
								const { auth } = await createPluginTestCase(pluginOpts);

								const someData = { answer: 42 };
								const now = Math.floor(Date.now() / 1000);

								const customKeyId: string = "custom";
								const { publicKey, privateKey } = await generateExportedKeyPair(
									pluginOpts?.jwks?.keyPairConfig,
								);
								publicKey.kid = customKeyId;
								privateKey.kid = customKeyId;

								const claimsExpOnly: JwtCustomClaims = {
									aud: null,
									exp: now + 5 * 60,
									iat: null,
									iss: null,
									typ: null,
								};

								async function testJwtVerification(
									jwt: string,
								): Promise<JWTPayload> {
									expect(jwt.length).toBeGreaterThan(10);

									const {
										payload,
										payloadCustom,
										payloadManual,
										protectedHeader,
									} = await verifyJwt(auth, jwt, claimsExpOnly, {
										now,
										jwk: publicKey,
										options: { requiredClaims: null, allowNoKeyId: true },
									});

									expect(payload).toBeDefined();
									expect(payload?.answer).toBe(someData.answer);
									expect(payloadCustom).toStrictEqual(payload); // make sure custom plugin works the same
									expect(payloadManual).toStrictEqual(payload); // make sure manual verification works the same

									checkPayloadClaims(payload!, claimsExpOnly);

									expect(protectedHeader).toStrictEqual({
										alg: privateKey.alg!,
									});
									return payload!;
								}

								const jwt = await new SignJWT({
									exp: now + 5 * 60,
									...someData,
								})
									.setProtectedHeader({ alg: privateKey.alg! })
									.sign(privateKey);

								expect(await testJwtVerification(jwt)).toStrictEqual({
									exp: now + 5 * 60,
									answer: someData.answer,
								});
							});

							//describe("Should fail to verify the JWT with invalid claims", async () => {
							it("Should fail to verify the JWT with invalid claims", async () => {
								const { auth, client } = await createPluginTestCase(pluginOpts);

								const jwks = await client.jwks();

								const localJwks = createLocalJWKSet(jwks.data!);

								const someData = { answer: 42 };

								async function testJwtVerificationShouldFail(
									claims: JwtCustomClaims,
									error: string,
									options?: JwtVerifyOptions,
									// customAuth? :
								): Promise<void> {
									await expect(
										auth.api.verifyJwt({
											body: {
												jwt: (
													await auth.api.signJwt({
														body: {
															data: someData,
															claims: claims,
														},
													})
												).token,
												options: options,
											},
										}),
									).rejects.toThrow(error);
									await expect(
										auth.api.customVerifyJwt({
											body: {
												jwt: (
													await auth.api.signJwt({
														body: {
															data: someData,
															claims: claims,
														},
													})
												).token,
												options: options,
											},
										}),
									).rejects.toThrow(error);
									await expect(
										auth.api.verifyJwt({
											body: {
												jwt: (
													await auth.api.customSignJwt({
														body: {
															data: someData,
															claims: claims,
														},
													})
												).token,
												options: options,
											},
										}),
									).rejects.toThrow(error);
									await expect(
										auth.api.customVerifyJwt({
											body: {
												jwt: (
													await auth.api.customSignJwt({
														body: {
															data: someData,
															claims: claims,
														},
													})
												).token,
												options: options,
											},
										}),
									).rejects.toThrow(error);
								}

								// Sanity checks
								async function testJwtVerificationShouldSucceed(
									claims: JwtCustomClaims,
									options?: JwtVerifyOptions,
								): Promise<{
									payload: JWTPayload | null;
									protectedHeader: JWTHeaderParameters;
								}> {
									const now = Math.floor(Date.now() / 1000);
									const {
										payload,
										payloadCustom,
										payloadManual,
										protectedHeader,
									} = await verifyJwt(
										auth,
										(
											await auth.api.signJwt({
												body: { data: someData, claims },
											})
										).token,
										claims,
										{
											now,
											localJwks,
											options: options,
										},
									);

									expect(payload).toBeDefined();
									expect(payload?.answer).toBe(someData.answer);
									expect(payloadCustom).toStrictEqual(payload); // make sure custom plugin works the same
									expect(payloadManual).toStrictEqual(payload); // make sure manual verification works the same

									checkPayloadClaims(payload!, claims);

									const customSignResult = await verifyJwt(
										auth,
										(
											await auth.api.customSignJwt({
												body: {
													data: someData,
													claims: {
														iat: payload!.iat,
														exp: payload!.exp,
														nbf: payload!.nbf,
														...claims,
													},
												},
											})
										).token,
										{
											iat: payload!.iat,
											exp: payload!.exp,
											nbf: payload!.nbf,
											...claims,
										},
										{
											now,
											localJwks,
											options: options,
										},
									);

									expect(customSignResult.payload).toStrictEqual(payload);
									expect(customSignResult.payloadCustom).toStrictEqual(payload);
									expect(customSignResult.payloadManual).toStrictEqual(payload);

									return { payload, protectedHeader };
								}

								//it("Audience tests", async () => {
								await testJwtVerificationShouldFail(
									{ aud: "wrongAud" },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: unexpected "aud" claim value',
								);
								await testJwtVerificationShouldFail(
									{ aud: "wrongAud" },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: unexpected "aud" claim value',
									{ allowedAudiences: ["rightAud"] },
								);
								await testJwtVerificationShouldSucceed(
									{ aud: "rightAud" },
									{ allowedAudiences: ["rightAud"] },
								);
								await testJwtVerificationShouldFail(
									{ aud: null },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: missing required "aud" claim',
								);
								await testJwtVerificationShouldFail(
									{ aud: null },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: missing required "aud" claim',
									{ requiredClaims: null },
								);
								await testJwtVerificationShouldSucceed(
									{ aud: null },
									{ allowedAudiences: null, requiredClaims: null },
								);
								await testJwtVerificationShouldFail(
									{ aud: ["wrong", "alsoWrong"] },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: unexpected "aud" claim value',
								);
								await testJwtVerificationShouldFail(
									{},
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: unexpected "aud" claim value',
									{ allowedAudiences: ["wrong", "alsoWrong"] },
								);
								//});

								//it("Issuer tests", async () => {
								await testJwtVerificationShouldFail(
									{ iss: null },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: missing required "iss" claim',
								);
								await testJwtVerificationShouldFail(
									{ iss: null },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: missing required "iss" claim',
									{ requiredClaims: null },
								);
								await testJwtVerificationShouldSucceed(
									{ iss: null },
									{ allowedIssuers: null, requiredClaims: null },
								);
								await testJwtVerificationShouldFail(
									{ iss: null },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: missing required "iss" claim',
									{ allowedIssuers: ["rightIssuer"] },
								);
								//});

								//it("Maximum Token Age tests", async () => {
								await testJwtVerificationShouldFail(
									{ iat: toJwtTime("-8 min") },
									"Failed to verify the JWT: the token has expired", //'Failed to verify the JWT: JWTExpired: "iat" claim timestamp check failed (too far in the past)',
									{ maxTokenAge: "5 min" },
								);
								await testJwtVerificationShouldFail(
									{ iat: toJwtTime("-8 min") },
									"Failed to verify the JWT", //"Failed to verify the JWT: TypeError: Invalid time period format",
									{ maxTokenAge: "what is this? 5 week" },
								);
								await testJwtVerificationShouldSucceed(
									{ iat: toJwtTime("-4 min") },
									{ maxTokenAge: "5 min" },
								);
								await testJwtVerificationShouldSucceed(
									{
										iat: toJwtTime("-2 weeks"),
										exp: toJwtTime("3 weeks"),
									},
									{ maxTokenAge: null },
								);
								await testJwtVerificationShouldFail(
									{
										iat: toJwtTime("-2 weeks"),
										exp: toJwtTime("3 weeks"),
									},
									"Failed to verify the JWT: the token has expired", //'Failed to verify the JWT: JWTExpired: "iat" claim timestamp check failed (too far in the past)',
								);
								await testJwtVerificationShouldFail(
									{ iat: toJwtTime("-8 min") },
									"Failed to verify the JWT: the token has expired", //'Failed to verify the JWT: JWTExpired: "iat" claim timestamp check failed (too far in the past)',
									{ maxTokenAge: "5 min" },
								);
								//});

								//it("Subject tests", async () => {
								await testJwtVerificationShouldFail(
									{ sub: "wrongSub" },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: unexpected "sub" claim value',
									{ expectedSubject: "rightSub" },
								);
								await testJwtVerificationShouldFail(
									{},
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: missing required "sub" claim',
									{ expectedSubject: "rightSub" },
								);
								await testJwtVerificationShouldSucceed(
									{ sub: "rightSub" },
									{ expectedSubject: "rightSub" },
								);
								await testJwtVerificationShouldFail(
									{},
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: missing required "sub" claim',
									{ requiredClaims: ["sub"] },
								);
								//});

								//it("Type tests", async () => {
								await testJwtVerificationShouldFail(
									{ typ: null },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: unexpected "typ" JWT header value',
								);
								await testJwtVerificationShouldSucceed(
									{ typ: null },
									{ expectedType: null },
								);
								await testJwtVerificationShouldFail(
									{ typ: "wrongTyp" },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: unexpected "typ" JWT header value',
								);
								await testJwtVerificationShouldFail(
									{ typ: "wrongTyp" },
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: unexpected "typ" JWT header value',
									{ expectedType: "rightTyp" },
								);
								await testJwtVerificationShouldSucceed(
									{ typ: "rightTyp" },
									{ expectedType: "rightTyp" },
								);
								//});

								//it("Required Claims tests", async () => {
								await testJwtVerificationShouldFail(
									{},
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: missing required "jti" claim',
									{ requiredClaims: ["jti"] },
								);
								await testJwtVerificationShouldSucceed(
									{ jti: "anything" },
									{ requiredClaims: ["jti"] },
								);
								await testJwtVerificationShouldFail(
									{},
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: missing required "nbf" claim',
									{ requiredClaims: ["nbf"] },
								);
								await testJwtVerificationShouldSucceed(
									{ nbf: toJwtTime("5 min ago") },
									{ requiredClaims: ["nbf"] },
								);
								//});

								//it("Invalid parsing tests", async () => {
								await expect(
									auth.api.signJwt({
										body: {
											data: { ...someData },
											claims: { iat: "what is this? 5 week" },
										},
									}),
								).rejects.toThrow("Invalid time period format");
								await expect(
									auth.api.signJwt({
										body: {
											data: { ...someData },
											claims: { exp: "what is this? 5 week" },
										},
									}),
								).rejects.toThrow("Invalid time period format");
								await expect(
									auth.api.signJwt({
										body: {
											data: { ...someData },
											claims: { nbf: "what is this? 5 week" },
										},
									}),
								).rejects.toThrow("Invalid time period format");
								await expect(
									auth.api.customSignJwt({
										body: {
											data: { ...someData },
											claims: { iat: "what is this? 5 week" },
										},
									}),
								).rejects.toThrow("Invalid time period format");
								await expect(
									auth.api.customSignJwt({
										body: {
											data: { ...someData },
											claims: { exp: "what is this? 5 week" },
										},
									}),
								).rejects.toThrow("Invalid time period format");
								await expect(
									auth.api.customSignJwt({
										body: {
											data: { ...someData },
											claims: { nbf: "what is this? 5 week" },
										},
									}),
								).rejects.toThrow("Invalid time period format");
								//});

								//it("Clock tolerance tests", async () => {
								await testJwtVerificationShouldFail(
									{
										iat: Math.floor(Date.now() / 1000 + 80),
									},
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: "iat" claim timestamp check failed (it should be in the past)',
								);
								await testJwtVerificationShouldSucceed({
									iat: Math.floor(Date.now() / 1000 + 20),
								});
								await testJwtVerificationShouldFail(
									{
										iat: Math.floor(Date.now() / 1000 + 10),
									},
									"Failed to verify the JWT", //'Failed to verify the JWT: JWTClaimValidationFailed: "iat" claim timestamp check failed (it should be in the past)',
									{ maxClockSkew: 5 },
								);
								//});
							});

							it("Should import JWK and use it", async () => {
								const { auth, client } = await createPluginTestCase(pluginOpts);

								const someData = { answer: 42 };
								const now = Math.floor(Date.now() / 1000);

								const customKeyId: string = "custom";
								const { privateKey } = await generateExportedKeyPair(
									pluginOpts?.jwks?.keyPairConfig,
								);
								privateKey.kid = customKeyId;

								await auth.api.importJwk({ body: { jwk: privateKey } });
								const jwks = await client.jwks();

								const localJwks = createLocalJWKSet(jwks.data!);

								async function testJwtVerification(
									jwt: string,
									claims: JwtCustomClaims,
								): Promise<JWTPayload> {
									expect(jwt.length).toBeGreaterThan(10);

									const {
										payload,
										payloadCustom,
										payloadManual,
										protectedHeader,
									} = await verifyJwt(auth, jwt, claims, { now, localJwks });

									expect(payload).toBeDefined();
									expect(payload?.answer).toBe(someData.answer);
									expect(payloadCustom).toStrictEqual(payload); // make sure custom plugin works the same
									expect(payloadManual).toStrictEqual(payload); // make sure manual verification works the same

									checkPayloadClaims(payload!, claims);

									expect(protectedHeader).toMatchObject({
										typ: claims?.typ,
										alg: pluginOpts?.jwks?.keyPairConfig?.alg ?? "EdDSA",
										kid: customKeyId,
									});
									return payload!;
								}

								const claims: JwtCustomClaims = {
									aud: ["customAud", "customAud2"],
									exp: now + 5 * 60,
									iat: now - 10,
									jti: "customJti",
									nbf: now - 2 * 60,
									sub: "customSub",
									typ: "customTyp",
								};

								expect(
									await testJwtVerification(
										(
											await auth.api.signJwt({
												body: {
													data: someData,
													jwk: customKeyId,
													claims: claims,
												},
											})
										).token,
										claims,
									),
								).toStrictEqual(
									await testJwtVerification(
										(
											await auth.api.customSignJwt({
												body: {
													data: someData,
													jwk: customKeyId,
													claims: claims,
												},
											})
										).token,
										claims,
									),
								);
							});

							it("Should revoke JWK and be unable to use it", async () => {
								const { auth, client } = await createPluginTestCase(pluginOpts);
								const customKeyId: string = "custom";
								const { privateKey } = await generateExportedKeyPair(
									randomAlgorithm(),
								);
								privateKey.kid = customKeyId;

								await expect(
									auth.api.importJwk({ body: { jwk: privateKey } }),
								).resolves.toMatchObject({ key: { id: customKeyId } });

								const jwks = await client.jwks();
								const someData = { answer: 42 };
								expect(jwks.data?.keys[0]?.kid).toBe(customKeyId);

								const jwt = (
									await auth.api.signJwt({
										body: {
											data: someData,
											jwk: customKeyId,
										},
									})
								).token;

								const maliciousJwt = await new SignJWT({
									exp: Math.floor(Date.now() / 1000 + 60),
									...someData,
								})
									.setProtectedHeader({
										alg:
											privateKey.alg ??
											pluginOpts?.jwks?.keyPairConfig?.alg ??
											"EdDSA",
										kid: customKeyId + revokedTag,
										typ: "JWT",
									})
									.sign(privateKey);

								expect(jwt.length).toBeGreaterThan(10);

								await auth.api.revokeJwk({ body: { keyId: customKeyId } });
								const jwksAgain = await client.jwks();
								expect(jwksAgain.data?.keys[0]?.kid).not.toBe(customKeyId);
								expect(jwksAgain.data?.keys.length).toBe(1);

								await expect(
									auth.api.verifyJwt({
										body: {
											jwt,
											jwk: customKeyId,
										},
									}),
								).rejects.toThrow(
									"Failed to verify the JWT", //'Failed to verify the JWT: BetterAuthError: Failed to sign JWT: Could not find a JWK with provided ID: "custom"',
								);

								await expect(
									auth.api.verifyJwt({
										body: {
											jwt,
											jwk: customKeyId + revokedTag,
										},
									}),
								).rejects.toThrow(
									"Failed to verify the JWT", //'Failed to verify the JWT: BetterAuthError: Failed to verify the JWT: Cannot verify the JWT using a revoked JWK with ID "custom revoked"',
								);

								await expect(
									auth.api.verifyJwt({
										body: {
											jwt: maliciousJwt,
											jwk: customKeyId + revokedTag,
											options: {
												requiredClaims: null,
												allowedAudiences: null,
												allowedIssuers: null,
											},
										},
									}),
								).rejects.toThrow(
									"Failed to verify the JWT", //'Failed to verify the JWT: BetterAuthError: Failed to verify the JWT: Cannot verify the JWT using a revoked JWK with ID "custom revoked"',
								);

								await expect(
									auth.api.verifyJwt({
										body: {
											jwt: maliciousJwt,
											options: {
												requiredClaims: null,
												allowedAudiences: null,
												allowedIssuers: null,
											},
										},
									}),
								).rejects.toThrow(
									"Failed to verify the JWT", //'Failed to verify the JWT: BetterAuthError: Failed to verify the JWT: Cannot verify the JWT using a revoked JWK with ID "custom revoked"',
								);

								await expect(
									auth.api.customVerifyJwt({
										body: {
											jwt,
											jwk: customKeyId,
										},
									}),
								).rejects.toThrow(
									"Failed to verify the JWT", //'Failed to verify the JWT: BetterAuthError: Failed to sign JWT: Could not find a JWK with provided ID: "custom"',
								);

								await expect(
									auth.api.customVerifyJwt({
										body: {
											jwt,
											jwk: customKeyId + revokedTag,
										},
									}),
								).rejects.toThrow(
									"Failed to verify the JWT", //'Failed to verify the JWT: BetterAuthError: Failed to verify the JWT: Cannot verify the JWT using a revoked JWK with ID "custom revoked"',
								);

								await expect(
									auth.api.customVerifyJwt({
										body: {
											jwt: maliciousJwt,
											jwk: customKeyId + revokedTag,
											options: {
												requiredClaims: null,
												allowedAudiences: null,
												allowedIssuers: null,
											},
										},
									}),
								).rejects.toThrow(
									"Failed to verify the JWT", //'Failed to verify the JWT: BetterAuthError: Failed to verify the JWT: Cannot verify the JWT using a revoked JWK with ID "custom revoked"',
								);

								await expect(
									auth.api.customVerifyJwt({
										body: {
											jwt: maliciousJwt,
											options: {
												requiredClaims: null,
												allowedAudiences: null,
												allowedIssuers: null,
											},
										},
									}),
								).rejects.toThrow(
									"Failed to verify the JWT", //'Failed to verify the JWT: BetterAuthError: Failed to verify the JWT: Cannot verify the JWT using a revoked JWK with ID "custom revoked"',
								);
							});

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
						});
					},
				);
			}),
	);
});
