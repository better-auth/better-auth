import type { JWK, JWTPayload } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createInMemoryDpopReplayStore,
	deriveDpopAth,
	deriveDpopJkt,
	enforceDpopBinding,
	verifyDpopProof,
} from "./dpop";
import { verifyAccessTokenRequest, verifyBearerToken } from "./verify";

const method = "GET";
const url = "https://api.example.com/resource";
const accessToken = "access-token-value";
const nowSeconds = 1_700_000_000;
const issuer = "https://issuer.example.com";

async function createProof(
	overrides: {
		accessToken?: string;
		headerJwk?: JWK;
		htm?: string;
		htu?: string;
		iat?: number;
		jti?: string;
		privateKey?: CryptoKey;
		publicJwk?: JWK;
	} = {},
) {
	const keyPair = overrides.privateKey
		? undefined
		: await generateKeyPair("ES256", { extractable: true });
	const privateKey = overrides.privateKey ?? keyPair?.privateKey;
	if (!privateKey) {
		throw new Error("missing private key");
	}
	const publicJwk =
		overrides.publicJwk ??
		(keyPair ? await exportJWK(keyPair.publicKey) : undefined);
	if (!publicJwk) {
		throw new Error("missing public jwk");
	}
	const proofAccessToken = overrides.accessToken;
	return new SignJWT({
		jti: overrides.jti ?? "proof-jti",
		htm: overrides.htm ?? method,
		htu: overrides.htu ?? url,
		iat: overrides.iat ?? nowSeconds,
		...(proofAccessToken ? { ath: await deriveDpopAth(proofAccessToken) } : {}),
	})
		.setProtectedHeader({
			typ: "dpop+jwt",
			alg: "ES256",
			jwk: overrides.headerJwk ?? publicJwk,
		})
		.sign(privateKey);
}

function mockIntrospectionResponse(payload: JWTPayload & { active: boolean }) {
	return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
		return new Response(JSON.stringify(payload), {
			headers: { "Content-Type": "application/json" },
		});
	});
}

function remoteVerifyOptions() {
	return {
		verifyOptions: {
			issuer,
			audience: url,
		},
		remoteVerify: {
			introspectUrl: `${issuer}/oauth2/introspect`,
			clientId: "resource-server",
			clientSecret: "resource-secret",
			force: true,
		},
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("verifyDpopProof", () => {
	it("verifies a token-endpoint proof and returns the JWK thumbprint", async () => {
		const { privateKey, publicKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		const proofJwt = await createProof({ privateKey, publicJwk });
		const proof = await verifyDpopProof({
			proofJwt,
			method,
			url,
			nowSeconds,
		});

		expect(proof.jkt).toBe(await deriveDpopJkt(publicJwk));
		expect(proof.htm).toBe(method);
		expect(proof.htu).toBe(url);
	});

	it("requires ath when validating a protected resource request", async () => {
		const proofJwt = await createProof();

		await expect(
			verifyDpopProof({
				proofJwt,
				method,
				url,
				accessToken,
				requireAth: true,
				nowSeconds,
			}),
		).rejects.toMatchObject({
			code: "invalid_dpop_proof",
			message: "DPoP proof must include an ath claim",
		});
	});

	it("accepts a resource proof bound to the access token hash", async () => {
		const proofJwt = await createProof({ accessToken });

		const proof = await verifyDpopProof({
			proofJwt,
			method,
			url,
			accessToken,
			requireAth: true,
			nowSeconds,
		});

		expect(proof.ath).toBe(await deriveDpopAth(accessToken));
	});

	it("rejects proof reuse within the replay window", async () => {
		const replayStore = createInMemoryDpopReplayStore();
		const proofJwt = await createProof({ accessToken });
		const options = {
			proofJwt,
			method,
			url,
			accessToken,
			requireAth: true,
			nowSeconds,
			replayStore,
		};

		await verifyDpopProof(options);
		await expect(verifyDpopProof(options)).rejects.toMatchObject({
			code: "invalid_dpop_proof",
			message: "DPoP proof jti has already been used",
		});
	});

	it("rejects method mismatch and private JWK material", async () => {
		const keyPair = await generateKeyPair("ES256", { extractable: true });
		const privateJwk = await exportJWK(keyPair.privateKey);
		const publicJwk = await exportJWK(keyPair.publicKey);
		const wrongMethodProof = await createProof({
			privateKey: keyPair.privateKey,
			publicJwk,
			htm: "POST",
		});
		const privateHeaderProof = await createProof({
			privateKey: keyPair.privateKey,
			publicJwk,
			headerJwk: privateJwk,
			jti: "private-jwk",
		});

		await expect(
			verifyDpopProof({
				proofJwt: wrongMethodProof,
				method,
				url,
				nowSeconds,
			}),
		).rejects.toMatchObject({
			code: "invalid_dpop_proof",
			message: "DPoP proof htm does not match the request method",
		});
		await expect(
			verifyDpopProof({
				proofJwt: privateHeaderProof,
				method,
				url,
				nowSeconds,
			}),
		).rejects.toMatchObject({
			code: "invalid_dpop_proof",
			message: "DPoP proof jwk must not contain private key material",
		});
	});

	it("requires request-aware verification for DPoP-bound access tokens", async () => {
		const { privateKey, publicKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		const jkt = await deriveDpopJkt(publicJwk);
		mockIntrospectionResponse({
			active: true,
			iss: issuer,
			aud: url,
			scope: "read",
			cnf: { jkt },
		});

		await expect(
			verifyBearerToken(accessToken, remoteVerifyOptions()),
		).rejects.toThrow("DPoP-bound access token requires");

		const proofJwt = await createProof({
			accessToken,
			privateKey,
			publicJwk,
			iat: Math.floor(Date.now() / 1000),
			jti: "request-aware-proof",
		});
		const payload = await verifyAccessTokenRequest(
			{
				authorizationHeader: `DPoP ${accessToken}`,
				dpopProofJwt: proofJwt,
				method,
				url,
			},
			remoteVerifyOptions(),
		);

		expect(payload.cnf).toMatchObject({ jkt });
	});
});

describe("enforceDpopBinding", () => {
	it("passes a bearer token with no DPoP binding", async () => {
		await expect(
			enforceDpopBinding({
				payload: { sub: "user" },
				authorization: { scheme: "Bearer", token: accessToken },
				proofJwt: undefined,
				method,
				url,
			}),
		).resolves.toBeUndefined();
	});

	it("rejects a non-bound token presented with the DPoP scheme", async () => {
		await expect(
			enforceDpopBinding({
				payload: { sub: "user" },
				authorization: { scheme: "DPoP", token: accessToken },
				proofJwt: undefined,
				method,
				url,
			}),
		).rejects.toMatchObject({ code: "invalid_token" });
	});

	it("rejects a DPoP-bound token presented with the bearer scheme", async () => {
		const { publicKey } = await generateKeyPair("ES256", { extractable: true });
		const jkt = await deriveDpopJkt(await exportJWK(publicKey));
		await expect(
			enforceDpopBinding({
				payload: { sub: "user", cnf: { jkt } },
				authorization: { scheme: "Bearer", token: accessToken },
				proofJwt: undefined,
				method,
				url,
			}),
		).rejects.toMatchObject({ code: "invalid_token" });
	});

	it("requires a proof header for a DPoP-bound token", async () => {
		const { publicKey } = await generateKeyPair("ES256", { extractable: true });
		const jkt = await deriveDpopJkt(await exportJWK(publicKey));
		await expect(
			enforceDpopBinding({
				payload: { sub: "user", cnf: { jkt } },
				authorization: { scheme: "DPoP", token: accessToken },
				proofJwt: undefined,
				method,
				url,
			}),
		).rejects.toMatchObject({ code: "invalid_dpop_proof" });
	});

	it("accepts a DPoP-bound token with a matching, ath-bound proof", async () => {
		const { privateKey, publicKey } = await generateKeyPair("ES256", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		const jkt = await deriveDpopJkt(publicJwk);
		const proofJwt = await createProof({
			privateKey,
			publicJwk,
			accessToken,
			iat: Math.floor(Date.now() / 1000),
			jti: "enforce-accepts",
		});
		await expect(
			enforceDpopBinding({
				payload: { sub: "user", cnf: { jkt } },
				authorization: { scheme: "DPoP", token: accessToken },
				proofJwt,
				method,
				url,
				replayStore: createInMemoryDpopReplayStore(),
			}),
		).resolves.toBeUndefined();
	});
});
