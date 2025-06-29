import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { jwtClient } from "./client";
import { jwt } from "./index";
import { importJWK, jwtVerify, JWK } from "jose";

describe("jwt", async (it) => {
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

	it("should get a token", async () => {
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

	it("Get a token", async () => {
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

	async function createAuthTest(jwksConfig: any) {
		return await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						...jwksConfig,
					},
				}),
			],
			logger: {
				level: "error",
			},
		});
	}

	function checkKeys(
		res: { keys: JWK[] } | undefined,
		kty: string,
		length: number,
		crv: string | undefined,
		alg: string,
	) {
		expect(res?.keys.at(0)?.kty).toBe(kty);
		if (res?.keys.at(0)?.crv) expect(res?.keys.at(0)?.crv).toBe(crv);
		expect(res?.keys.at(0)?.alg).toBe(alg);
		if (res?.keys.at(0)?.x) expect(res?.keys.at(0)?.x).toHaveLength(length);
		if (res?.keys.at(0)?.y) expect(res?.keys.at(0)?.y).toHaveLength(length);
		if (res?.keys.at(0)?.n) expect(res?.keys.at(0)?.n).toHaveLength(length);
		// Not checking RSA exponent
	}

	async function checkToken(auth: any, signInWithTestUser: any) {
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
	}

	const algorithmsToTest = [
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
		},
	];

	for (const algorithm of algorithmsToTest) {
		const expectedOutcome = algorithm.expectedOutcome;

		const { auth: authToTest, signInWithTestUser: signInWithTestUserToTest } =
			await createAuthTest({
				keyPairConfig: {
					...algorithm.keyPairConfig,
				},
			});

		it(`${algorithm.keyPairConfig.alg}${
			algorithm.keyPairConfig.crv ? "(" + algorithm.keyPairConfig.crv + ")" : ""
		} algorithm can be used to generate JWKS`, async () => {
			console.error(await authToTest.api.getJwks());
			checkKeys(
				await authToTest.api.getJwks(),
				expectedOutcome.ec,
				expectedOutcome.length,
				expectedOutcome.crv,
				expectedOutcome.alg,
			);
		});

		it(`${algorithm.keyPairConfig.alg}${
			algorithm.keyPairConfig.crv ? "(" + algorithm.keyPairConfig.crv + ")" : ""
		} algorithm can be used to generate a token`, async () => {
			checkToken(authToTest, signInWithTestUserToTest);
		});

		const {
			auth: authToTest_noEncrypt,
			signInWithTestUser: signInWithTestUserToTest_noEncrypt,
		} = await createAuthTest({
			keyPairConfig: {
				...algorithm.keyPairConfig,
			},
			disablePrivateKeyEncryption: true,
		});

		it(`${algorithm.keyPairConfig.alg}${
			algorithm.keyPairConfig.crv ? "(" + algorithm.keyPairConfig.crv + ")" : ""
		} algorithm without private key encryption can be used to generate JWKS`, async () => {
			checkKeys(
				await authToTest_noEncrypt.api.getJwks(),
				expectedOutcome.ec,
				expectedOutcome.length,
				expectedOutcome.crv,
				expectedOutcome.alg,
			);
		});

		it(`${algorithm.keyPairConfig.alg}${
			algorithm.keyPairConfig.crv ? "(" + algorithm.keyPairConfig.crv + ")" : ""
		} algorithm without private key encryption can be used to generate a token`, async () => {
			checkToken(authToTest_noEncrypt, signInWithTestUserToTest_noEncrypt);
		});
	}
});
