import type { JWK, JWTPayload } from "jose";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	assertDpopProofNonce,
	createDpopNonce,
	createDpopReplayStore,
	createInMemoryDpopReplayStore,
	deriveDpopAth,
	deriveDpopJkt,
	enforceDpopBinding,
	getConfirmationJkt,
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
		nonce?: unknown;
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
		...(overrides.nonce !== undefined ? { nonce: overrides.nonce } : {}),
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
	vi.useRealTimers();
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

	it("rejects a header jwk that passes shape checks but fails to import as invalid_dpop_proof", async () => {
		// `kty`/`crv` look fine and there is no private material, so it clears the
		// shape checks, but the coordinates are not a real P-256 point, so
		// `importJWK` throws. That must surface as a protocol error, not a 500.
		const proofJwt = await createProof({
			headerJwk: { kty: "EC", crv: "P-256", x: "AAAA", y: "AAAA" },
			jti: "bad-jwk-coords",
		});

		await expect(
			verifyDpopProof({ proofJwt, method, url, nowSeconds }),
		).rejects.toMatchObject({ code: "invalid_dpop_proof" });
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

	it("rejects an access token presented without the Bearer or DPoP scheme", async () => {
		await expect(
			verifyAccessTokenRequest(
				{ authorizationHeader: "raw-token-without-scheme", method, url },
				remoteVerifyOptions(),
			),
		).rejects.toThrow("authorization scheme must be Bearer or DPoP");
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

describe("createDpopReplayStore", () => {
	it("delegates to reserveVerificationValue, namespaces the key, and rejects a replay", async () => {
		const seen = new Set<string>();
		const identifiers: string[] = [];
		const store = createDpopReplayStore({
			reserveVerificationValue: async ({ identifier }) => {
				identifiers.push(identifier);
				if (seen.has(identifier)) return false;
				seen.add(identifier);
				return true;
			},
		});
		const reservation = {
			key: "replay-key",
			expiresAt: new Date(Date.now() + 300_000),
			now: new Date(),
		};

		expect(await store.reserve(reservation)).toBe(true);
		expect(await store.reserve(reservation)).toBe(false);
		expect(identifiers.every((id) => id.startsWith("dpop-proof:"))).toBe(true);
	});
});

describe("getConfirmationJkt", () => {
	it("returns the jkt only for an object carrying a non-empty string jkt", () => {
		expect(getConfirmationJkt({ jkt: "thumbprint" })).toBe("thumbprint");
	});

	it("returns undefined for confirmations without a usable jkt", () => {
		expect(getConfirmationJkt({ "x5t#S256": "cert-hash" })).toBeUndefined();
		expect(getConfirmationJkt({ jkt: "" })).toBeUndefined();
		expect(getConfirmationJkt({ jkt: 123 })).toBeUndefined();
		expect(getConfirmationJkt(undefined)).toBeUndefined();
		expect(getConfirmationJkt(null)).toBeUndefined();
	});

	it("returns undefined for a truthy non-object instead of throwing", () => {
		// A corrupted JSON column can deserialize to a primitive or array; the
		// `in` operator would throw a TypeError on these, so guard against it.
		expect(() => getConfirmationJkt("malformed")).not.toThrow();
		expect(getConfirmationJkt("malformed")).toBeUndefined();
		expect(getConfirmationJkt(42)).toBeUndefined();
		expect(getConfirmationJkt(["jkt"])).toBeUndefined();
	});
});

/**
 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-8
 * @see https://datatracker.ietf.org/doc/html/rfc9449#section-9
 */
describe("server-provided DPoP nonces", () => {
	const secret = "dpop-nonce-secret-that-is-long-enough";
	const nonceOptions = { secret };

	/** Mints a nonce as if the server issued it at `issuedAt` (epoch seconds). */
	async function nonceIssuedAt(issuedAt: number, nonceSecret = secret) {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(issuedAt * 1000);
		try {
			return await createDpopNonce({ secret: nonceSecret });
		} finally {
			vi.useRealTimers();
		}
	}

	async function verifyAt(at: number, proofOverrides: { nonce?: unknown }) {
		return verifyDpopProof({
			proofJwt: await createProof({ iat: at, ...proofOverrides }),
			method,
			url,
			nowSeconds: at,
			nonce: nonceOptions,
		});
	}

	it("issues opaque nonces in the RFC 9449 §8.1 nonce syntax", async () => {
		const nonce = await createDpopNonce(nonceOptions);
		// nonce = 1*NQCHAR
		expect(nonce).toMatch(/^[\x21\x23-\x5b\x5d-\x7e]+$/);
	});

	it("accepts a proof carrying a nonce this secret issued", async () => {
		const nonce = await nonceIssuedAt(nowSeconds);
		const proof = await verifyAt(nowSeconds + 10, { nonce });
		expect(proof.nonce).toBe(nonce);
	});

	it("asks for a nonce when the proof has none", async () => {
		await expect(verifyAt(nowSeconds, {})).rejects.toMatchObject({
			code: "use_dpop_nonce",
			message: "DPoP proof must include a server-provided nonce",
		});
	});

	it("accepts a nonce through its lifetime and asks for a new one after", async () => {
		const nonce = await nonceIssuedAt(nowSeconds);

		await expect(verifyAt(nowSeconds + 300, { nonce })).resolves.toMatchObject({
			nonce,
		});
		await expect(verifyAt(nowSeconds + 301, { nonce })).rejects.toMatchObject({
			code: "use_dpop_nonce",
			message: "DPoP proof nonce is invalid or expired",
		});
	});

	it("honors a custom nonce lifetime", async () => {
		const nonce = await nonceIssuedAt(nowSeconds);
		const verify = async (at: number) =>
			verifyDpopProof({
				proofJwt: await createProof({ iat: at, nonce }),
				method,
				url,
				nowSeconds: at,
				nonce: { secret, expiresIn: 60 },
			});

		await expect(verify(nowSeconds + 60)).resolves.toBeDefined();
		await expect(verify(nowSeconds + 61)).rejects.toMatchObject({
			code: "use_dpop_nonce",
		});
	});

	it("rejects a nonce minted under another secret", async () => {
		const nonce = await nonceIssuedAt(
			nowSeconds,
			"another-deployment-secret-long-enough",
		);
		await expect(verifyAt(nowSeconds, { nonce })).rejects.toMatchObject({
			code: "use_dpop_nonce",
			message: "DPoP proof nonce is invalid or expired",
		});
	});

	it("rejects a nonce whose issue time was altered", async () => {
		const nonce = await nonceIssuedAt(nowSeconds - 3600);
		const [, mac] = nonce.split(".");
		const [timestamp] = (await nonceIssuedAt(nowSeconds)).split(".");
		await expect(
			verifyAt(nowSeconds, { nonce: `${timestamp}.${mac}` }),
		).rejects.toMatchObject({ code: "use_dpop_nonce" });
	});

	it("tolerates small clock differences between instances, not future-dated nonces", async () => {
		const slightlyAhead = await nonceIssuedAt(nowSeconds + 60);
		const farAhead = await nonceIssuedAt(nowSeconds + 61);

		await expect(
			verifyAt(nowSeconds, { nonce: slightlyAhead }),
		).resolves.toBeDefined();
		await expect(
			verifyAt(nowSeconds, { nonce: farAhead }),
		).rejects.toMatchObject({ code: "use_dpop_nonce" });
	});

	it.each([
		"not-a-nonce",
		"a.b.c",
		"AAAAAAAAAAA.",
		".AAAAAAAAAAA",
		"x".repeat(200),
	])("asks for a new nonce instead of an unknown one: %s", async (nonce) => {
		await expect(verifyAt(nowSeconds, { nonce })).rejects.toMatchObject({
			code: "use_dpop_nonce",
		});
	});

	it.each([123, ""])(
		"rejects a malformed nonce claim %j as an invalid proof",
		async (nonce) => {
			await expect(verifyAt(nowSeconds, { nonce })).rejects.toMatchObject({
				code: "invalid_dpop_proof",
			});
		},
	);

	it("reports other proof errors before the nonce", async () => {
		const proofJwt = await createProof({ htm: "POST" });
		await expect(
			verifyDpopProof({
				proofJwt,
				method,
				url,
				nowSeconds,
				nonce: nonceOptions,
			}),
		).rejects.toMatchObject({ code: "invalid_dpop_proof" });
	});

	it("does not reserve the jti of a proof it challenges", async () => {
		const replayStore = createInMemoryDpopReplayStore();
		const reserve = vi.spyOn(replayStore, "reserve");

		await expect(
			verifyDpopProof({
				proofJwt: await createProof({ jti: "challenged" }),
				method,
				url,
				nowSeconds,
				replayStore,
				nonce: nonceOptions,
			}),
		).rejects.toMatchObject({ code: "use_dpop_nonce" });
		expect(reserve).not.toHaveBeenCalled();
	});

	it("lets one nonce serve concurrent proofs while each jti is used once", async () => {
		// RFC 9449 §11.1: a nonce may be reused; jti tracking stops replay.
		const replayStore = createInMemoryDpopReplayStore();
		const nonce = await nonceIssuedAt(nowSeconds);
		const verify = (proofJwt: string) =>
			verifyDpopProof({
				proofJwt,
				method,
				url,
				nowSeconds,
				replayStore,
				nonce: nonceOptions,
			});
		const first = await createProof({ jti: "first", nonce });
		const second = await createProof({ jti: "second", nonce });

		const fresh = await Promise.allSettled([verify(first), verify(second)]);
		expect(fresh.map((result) => result.status)).toEqual([
			"fulfilled",
			"fulfilled",
		]);

		const third = await createProof({ jti: "third", nonce });
		const raced = await Promise.allSettled([verify(third), verify(third)]);
		expect(
			raced.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		await expect(verify(first)).rejects.toMatchObject({
			message: "DPoP proof jti has already been used",
		});
	});

	it("rejects invalid nonce settings", async () => {
		await expect(createDpopNonce({ secret: "" })).rejects.toThrow(TypeError);
		await expect(
			verifyDpopProof({
				proofJwt: await createProof({ nonce: "anything" }),
				method,
				url,
				nowSeconds,
				nonce: { secret, expiresIn: 0 },
			}),
		).rejects.toThrow("DPoP nonce expiresIn must be a positive integer");
	});

	describe("enforceDpopBinding", () => {
		it("surfaces the nonce challenge as use_dpop_nonce", async () => {
			const { privateKey, publicKey } = await generateKeyPair("ES256", {
				extractable: true,
			});
			const publicJwk = await exportJWK(publicKey);
			await expect(
				enforceDpopBinding({
					payload: {
						sub: "user",
						cnf: { jkt: await deriveDpopJkt(publicJwk) },
					},
					authorization: { scheme: "DPoP", token: accessToken },
					proofJwt: await createProof({
						privateKey,
						publicJwk,
						accessToken,
						iat: Math.floor(Date.now() / 1000),
					}),
					method,
					url,
					nonce: nonceOptions,
				}),
			).rejects.toMatchObject({ code: "use_dpop_nonce" });
		});
	});

	describe("assertDpopProofNonce", () => {
		it("challenges a proof without a current nonce", async () => {
			await expect(
				assertDpopProofNonce(await createProof(), nonceOptions),
			).rejects.toMatchObject({ code: "use_dpop_nonce" });
			await expect(
				assertDpopProofNonce(
					await createProof({ nonce: await nonceIssuedAt(nowSeconds) }),
					nonceOptions,
				),
			).rejects.toMatchObject({ code: "use_dpop_nonce" });
		});

		it("passes a current nonce and leaves malformed proofs to full verification", async () => {
			const current = await createDpopNonce(nonceOptions);
			await expect(
				assertDpopProofNonce(
					await createProof({ nonce: current }),
					nonceOptions,
				),
			).resolves.toBeUndefined();
			await expect(
				assertDpopProofNonce("not-a-jwt", nonceOptions),
			).resolves.toBeUndefined();
			await expect(
				assertDpopProofNonce(await createProof({ nonce: 42 }), nonceOptions),
			).resolves.toBeUndefined();
		});
	});

	describe("verifyAccessTokenRequest", () => {
		async function boundToken() {
			const { privateKey, publicKey } = await generateKeyPair("ES256", {
				extractable: true,
			});
			const publicJwk = await exportJWK(publicKey);
			mockIntrospectionResponse({
				active: true,
				iss: issuer,
				aud: url,
				scope: "read",
				cnf: { jkt: await deriveDpopJkt(publicJwk) },
			});
			return (nonce?: string | null) =>
				createProof({
					privateKey,
					publicJwk,
					accessToken,
					iat: Math.floor(Date.now() / 1000),
					jti: crypto.randomUUID(),
					...(nonce ? { nonce } : {}),
				});
		}

		function verify(
			dpopProofJwt: string,
			nonce: { required: boolean; secret: string } | undefined = {
				required: true,
				secret,
			},
		) {
			return verifyAccessTokenRequest(
				{
					authorizationHeader: `DPoP ${accessToken}`,
					dpopProofJwt,
					method,
					url,
				},
				{ ...remoteVerifyOptions(), dpop: { nonce } },
			);
		}

		it("answers a missing nonce with a 401 carrying a fresh DPoP-Nonce", async () => {
			const proof = await boundToken();

			const error = await verify(await proof()).catch((e: unknown) => e);
			expect(error).toMatchObject({
				statusCode: 401,
				body: {
					error: "use_dpop_nonce",
					error_description: "DPoP proof must include a server-provided nonce",
				},
			});
			const nonce = new Headers(
				(error as { headers: HeadersInit }).headers,
			).get("DPoP-Nonce");
			expect(nonce).toEqual(expect.any(String));

			await expect(verify(await proof(nonce))).resolves.toMatchObject({
				cnf: expect.any(Object),
			});
		});

		it("leaves nonces unchecked unless required", async () => {
			const proof = await boundToken();
			await expect(
				verify(await proof(), { required: false, secret }),
			).resolves.toBeDefined();
		});

		it("does not ask a bearer request for a nonce", async () => {
			mockIntrospectionResponse({
				active: true,
				iss: issuer,
				aud: url,
				scope: "read",
			});
			await expect(
				verifyAccessTokenRequest(
					{ authorizationHeader: `Bearer ${accessToken}`, method, url },
					{
						...remoteVerifyOptions(),
						dpop: { nonce: { required: true, secret } },
					},
				),
			).resolves.toMatchObject({ active: true });
		});
	});
});
