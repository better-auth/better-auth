import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { jwtClient } from "./client";
import { jwt } from "./index";
import { importJWK, jwtVerify } from "jose";

type JWKOptions =
	| {
			alg: "EdDSA"; // EdDSA with either Ed25519
			crv?: "Ed25519";
	  }
	| {
			alg: "ES256"; // ECDSA with P-256 curve
			crv?: never; // Only one valid option, no need for crv
	  }
	| {
			alg: "RS256"; // RSA with SHA-256
			modulusLength?: number; // Default to 2048 or higher
	  }
	| {
			alg: "PS256"; // RSA-PSS with SHA-256
			modulusLength?: number; // Default to 2048 or higher
	  }
	| {
			alg: "ES512"; // ECDSA with P-521 curve
			crv?: never; // Only P-521 for ES512
	  };

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

	it("Client gets a token from session", async () => {
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

	it("Client gets a token", async () => {
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		expect(token.data?.token).toBeDefined();
	});

	it("Get JWKS", async () => {
		// If no JWK exists, this makes sure it gets added.
		// TODO: Replace this with a generate JWKS endpoint once it exists.
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		expect(token.data?.token).toBeDefined();

		const jwks = await client.jwks();

		expect(jwks.data?.keys).length.above(0);
	});

	it("Signed tokens can be validated with the JWKS", async () => {
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		const jwks = await client.jwks();

		const publicWebKey = await importJWK({
			...jwks.data?.keys[0],
			alg: "EdDSA",
		});
		const decoded = await jwtVerify(token.data?.token!, publicWebKey);

		expect(decoded).toBeDefined();
	});

	it("should set subject to user id by default", async () => {
		const token = await client.token({
			fetchOptions: {
				headers,
			},
		});

		const jwks = await client.jwks();

		const publicWebKey = await importJWK({
			...jwks.data?.keys[0],
			alg: "EdDSA",
		});
		const decoded = await jwtVerify(token.data?.token!, publicWebKey);
		expect(decoded.payload.sub).toBeDefined();
		expect(decoded.payload.sub).toBe(decoded.payload.id);
	});

	const algorithmsToTest: {
		keyPairConfig: JWKOptions;
		expectedOutcome: { ec: string; length: number; crv?: string; alg: string };
	}[] = [
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
		// This is not supported (https://github.com/panva/jose/issues/210)
		/*
		{
			keyPairConfig: {
				alg: "EdDSA",
				crv: "Ed448",
			},
			expectedOutcome: {
				ec: "OKP",
				length: 43,
				crv: "Ed448",
				alg: "EdDSA",
			},
		},*/
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
		// We cannot sign using key exchange protocol, need to establish a key first (only allowed usage for these keys is `deriveBits`)
		/*
		{
			keyPairConfig: {
				alg: "ECDH-ES",
				crv: "P-256",
			},
			expectedOutcome: {
				ec: "EC",
				length: 43,
				crv: "P-256",
				alg: "ECDH-ES",
			},
		},
		{
			keyPairConfig: {
				alg: "ECDH-ES",
				crv: "P-384",
			},
			expectedOutcome: {
				ec: "EC",
				length: 64,
				crv: "P-384",
				alg: "ECDH-ES",
			},
		},
		{
			keyPairConfig: {
				alg: "ECDH-ES",
				crv: "P-521",
			},
			expectedOutcome: {
				ec: "EC",
				length: 88,
				crv: "P-521",
				alg: "ECDH-ES",
			},
		},*/
	];

	for (const algorithm of algorithmsToTest) {
		const expectedOutcome = algorithm.expectedOutcome;
		for (let disablePrivateKeyEncryption of [false, true]) {
			let error: boolean = false;
			try {
				const { auth, signInWithTestUser } = await getTestInstance({
					plugins: [
						jwt({
							jwks: {
								keyPairConfig: {
									...algorithm.keyPairConfig,
								},
								disablePrivateKeyEncryption: disablePrivateKeyEncryption,
							},
						}),
					],
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
					? "without private key encryption "
					: "";

				it(`${alg} algorithm ${enc} can be used to generate JWKS`, async () => {
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

				it(`${alg} algorithm ${enc} can be used to generate a token`, async () => {
					let token = undefined;
					let error: boolean = false;

					try {
						const { headers } = await signInWithTestUser();
						expect(headers).toBeDefined();

						const client = createAuthClient({
							plugins: [jwtClient()],
							baseURL: "http://localhost:3000/api/auth",
							fetchOptions: {
								customFetchImpl: async (url, init) => {
									return auth.handler(new Request(url, init));
								},
							},
						});

						token = await client.token({
							fetchOptions: {
								headers,
							},
						});
					} catch (err) {
						console.error(err);
						error = true;
					}
					expect(error).toBeFalsy();
					expect(token?.data?.token).toBeDefined();
				});
			} catch (err) {
				console.error(err);
				error = true;
			}
			expect(error).toBeFalsy();
		}
	}
});
