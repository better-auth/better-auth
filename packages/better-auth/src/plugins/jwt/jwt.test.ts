import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { jwtClient } from "./client";
import { jwt } from "./index";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import type { JWKOptions, JwtPluginOptions } from "./types";
import { generateExportedKeyPair } from "./sign";

describe("jwt", async (it) => {
	// Testing the default behaviour
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [jwt()],
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

	it("should receive token on client via header", async () => {
		let token: string | null = null;
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					token = context.response.headers.get("set-auth-jwt");
				},
			},
		});
		expect(token).not.toBeNull();
	});

	it("should get a token from api fetch", async () => {
		const response = await client.$fetch<{
			token: string;
		}>("/token", {
			headers,
		});
		expect(response.data?.token).toBeDefined();
	});

	it("should get /jwks", async () => {
		const response = await client.$fetch<JSONWebKeySet>("/jwks");
		const jwks = response?.data;
		expect(jwks).toBeDefined();
		expect(jwks?.keys.length).toBeGreaterThanOrEqual(1);
	});

	it("should validate signed via JWKS", async () => {
		const response = await client.$fetch<{
			token: string;
		}>("/token", {
			headers,
		});
		const token = response.data?.token ?? undefined;
		expect(token).toBeDefined();

		const jwkResponse = await client.$fetch<JSONWebKeySet>("/jwks");
		const jwksData = jwkResponse?.data ?? undefined;
		expect(jwksData).toBeDefined();

		const jwks = createLocalJWKSet(jwksData!);
		expect(() => jwtVerify(token!, jwks)).not.toThrow();
		const decoded = await jwtVerify(token!, jwks);
		expect(decoded).toBeDefined();
	});

	it("should set subject to user id by default", async () => {
		let token: string | null | undefined;
		const userSession = await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					token = context.response.headers.get("set-auth-jwt");
				},
			},
		});
		expect(token).toBeDefined();

		const jwkResponse = await client.$fetch<JSONWebKeySet>("/jwks");
		const jwksData = jwkResponse?.data ?? undefined;
		expect(jwksData).toBeDefined();
		const jwks = createLocalJWKSet(jwksData!);

		const decoded = await jwtVerify(token!, jwks);
		expect(decoded.payload.sub).toBeDefined();
		expect(decoded.payload.sub).toBe(userSession.data?.user.id);
	});

	// Asymmetric (JWS) Supported (https://github.com/panva/jose/issues/210)
	const algorithmsToTest: {
		keyPairConfig: JWKOptions;
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
			const jwtOptions: JwtPluginOptions = {
				jwks: {
					keyPairConfig: {
						...algorithm.keyPairConfig,
					},
					disablePrivateKeyEncryption: disablePrivateKeyEncryption,
				},
			};
			try {
				const { auth, signInWithTestUser } = await getTestInstance({
					plugins: [jwt(jwtOptions)],
					logger: {
						level: "error",
					},
				});

				const alg: string =
					algorithm.keyPairConfig.alg +
					("crv" in algorithm.keyPairConfig
						? `(${algorithm.keyPairConfig.crv})`
						: "");
				const enc: string = disablePrivateKeyEncryption
					? " without private key encryption"
					: "";

				it(`${alg} algorithm${enc} can be used to generate JWKS`, async () => {
					// Unit Test
					const { publicWebKey, privateWebKey } =
						await generateExportedKeyPair(jwtOptions);
					for (const key of [publicWebKey, privateWebKey]) {
						expect(key.kty).toBe(expectedOutcome.ec);
						if (key.x) expect(key.x).toHaveLength(expectedOutcome.length);
						if (key.y) expect(key.y).toHaveLength(expectedOutcome.length);
						if (key.n) expect(key.n).toHaveLength(expectedOutcome.length);
					}

					// Functional Test
					const jwkResponse = await client.$fetch<JSONWebKeySet>("/jwks");
					const jwks = jwkResponse?.data ?? undefined;
					expect(jwks).toBeDefined();

					expect(jwks?.keys.at(0)?.kty).toBe(expectedOutcome.ec);
					if (jwks?.keys.at(0)?.crv)
						expect(jwks?.keys.at(0)?.crv).toBe(expectedOutcome.crv);
					expect(jwks?.keys.at(0)?.alg).toBe(expectedOutcome.alg);
					if (jwks?.keys.at(0)?.x)
						expect(jwks?.keys.at(0)?.x).toHaveLength(expectedOutcome.length);
					if (jwks?.keys.at(0)?.y)
						expect(jwks?.keys.at(0)?.y).toHaveLength(expectedOutcome.length);
					if (jwks?.keys.at(0)?.n)
						expect(jwks?.keys.at(0)?.n).toHaveLength(expectedOutcome.length);
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
				let headers: Headers | undefined = undefined;

				it(`${alg} algorithm${enc}: Client can sign in`, async () => {
					try {
						const { headers: heads } = await signInWithTestUser();
						headers = heads;
						expect(headers).toBeDefined();
					} catch (err) {
						console.error(err);
						expect.unreachable();
					}
				});

				it(`${alg} algorithm${enc}: Client gets a token`, async () => {
					const response = await client.$fetch<{
						token: string;
					}>("/token", {
						headers,
					});
					expect(response.data?.token).toBeDefined();
				});

				it(`${alg} algorithm${enc}: should receive via header`, async () => {
					let token: string | null = null;
					await client.getSession({
						fetchOptions: {
							headers,
							onSuccess(context) {
								token = context.response.headers.get("set-auth-jwt");
							},
						},
					});
					expect(token).not.toBeNull();
				});

				it(`${alg} algorithm${enc}: should validate via JWKS`, async () => {
					const response = await client.$fetch<{
						token: string;
					}>("/token", {
						headers,
					});
					const token = response.data?.token ?? undefined;
					expect(token).toBeDefined();

					const jwkResponse = await client.$fetch<JSONWebKeySet>("/jwks");
					const jwksData = jwkResponse?.data ?? undefined;
					expect(jwksData).toBeDefined();

					const jwks = createLocalJWKSet(jwksData!);
					expect(() => jwtVerify(token!, jwks)).not.toThrow();
					const decoded = await jwtVerify(token!, jwks);
					expect(decoded).toBeDefined();
				});

				it(`${alg} algorithm${enc}: Should set subject to user id by default`, async () => {
					let token: string | null | undefined;
					const userSession = await client.getSession({
						fetchOptions: {
							headers,
							onSuccess(context) {
								token = context.response.headers.get("set-auth-jwt");
							},
						},
					});
					expect(token).toBeDefined();

					const jwkResponse = await client.$fetch<JSONWebKeySet>("/jwks");
					const jwksData = jwkResponse?.data ?? undefined;
					expect(jwksData).toBeDefined();
					const jwks = createLocalJWKSet(jwksData!);

					const decoded = await jwtVerify(token!, jwks);
					expect(decoded.payload.sub).toBeDefined();
					expect(decoded.payload.sub).toBe(userSession.data?.user.id);
				});
			} catch (err) {
				console.error(err);
				expect.unreachable();
			}
		}
	}
});

describe("jwt - remote signing", async (it) => {
	it("should fail if sign is defined and remoteUrl is not", async () => {
		expect(() =>
			getTestInstance({
				plugins: [
					jwt({
						jwt: {
							sign: () => {
								return "123";
							},
						},
					}),
				],
				logger: {
					level: "error",
				},
			}),
		).toThrow();
	});
});

describe("jwt - oidc plugin", async (it) => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [
			jwt({
				usesOauthProvider: true,
			}),
		],
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

	it("should not receive token on client via header", async () => {
		let token: string | null | undefined;
		await client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					token = context.response.headers.get("set-auth-jwt");
				},
			},
		});
		expect(token).toBeNull();
	});

	it("should disable /token", async () => {
		const response = await client.$fetch<{
			token: string;
		}>("/token", {
			headers,
		});
		expect(response.error?.status).toBe(404);
	});

	it("should enable /jwks", async () => {
		const response = await client.$fetch<JSONWebKeySet>("/jwks");
		const jwks = response?.data;
		expect(jwks).toBeDefined();
		expect(jwks?.keys.length).toBeGreaterThanOrEqual(1);
	});
});

describe("jwt - oidc plugin with remote url", async (it) => {
	const { auth } = await getTestInstance({
		plugins: [
			jwt({
				usesOauthProvider: true,
				jwks: {
					remoteUrl: "https://example.com",
					keyPairConfig: {
						alg: "ES256",
					},
				},
			}),
		],
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

	it("should require specifying the alg used", async () => {
		expect(() =>
			getTestInstance({
				plugins: [
					jwt({
						usesOauthProvider: true,
						jwks: {
							remoteUrl: "https://example.com",
						},
					}),
				],
				logger: {
					level: "error",
				},
			}),
		).toThrow();
	});

	it("should disable /jwks", async () => {
		const response = await client.$fetch<JSONWebKeySet>("/jwks");
		expect(response.error?.status).toBe(404);
	});
});
