import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { decodeProtectedHeader } from "jose";
import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt } from ".";
import { getJwksAdapter } from "./adapter";
import { signJWT } from "./sign";
import type { JWSAlgorithms, Jwk } from "./types";
import { generateExportedKeyPair } from "./utils";

/**
 * The `auth.$context` resolved type is more specific than the generic
 * `AuthContext` (the plugin set is concrete), so passing it to functions
 * typed against the generic version trips TS up. Tests don't care; this
 * shim lets test scaffolding stay readable while the production helpers
 * keep their precise types.
 */
type AuthContextShim = AuthContext;
const asShim = (ctx: unknown): AuthContextShim => ctx as AuthContextShim;

/**
 * Helper: provisions a JWK with a specific algorithm by directly inserting
 * into the `jwks` table. Returns the inserted row's `id` so tests can
 * reference it by kid.
 */
async function provisionKey(
	ctx: AuthContextShim,
	alg: JWSAlgorithms,
): Promise<Jwk> {
	// Use the production keypair generator so each test key has a real
	// public/private pair compatible with `importJWK`. `generateExportedKeyPair`
	// fills in sensible `crv`/`modulusLength` defaults from the alg.
	const { publicWebKey, privateWebKey } = await generateExportedKeyPair({
		jwks: { keyPairConfig: { alg } as never },
	});
	return ctx.adapter.create<Omit<Jwk, "id">, Jwk>({
		model: "jwks",
		data: {
			publicKey: JSON.stringify(publicWebKey),
			// Tests run with disablePrivateKeyEncryption so the raw JWK is fine.
			privateKey: JSON.stringify(privateWebKey),
			alg,
			createdAt: new Date(),
		},
	});
}

const jwtOptions = { jwks: { disablePrivateKeyEncryption: true } } as const;

const bootJwt = () =>
	getTestInstance({
		plugins: [jwt(jwtOptions)],
		logger: { level: "error" },
	});

/**
 * Helper: builds a minimal `GenericEndpointContext` shim suitable for
 * passing to `signJWT`. Real handlers receive a much richer object, but
 * signJWT only reads `ctx.context.{adapter, options, secretConfig}`.
 */
function makeSignCtx(authCtx: AuthContextShim): GenericEndpointContext {
	return { context: authCtx } as unknown as GenericEndpointContext;
}

describe("signJWT — signing key overrides", () => {
	it("uses the latest key when neither signingKeyId nor signingAlgorithm is set", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		const provisioned = await provisionKey(ctx, "EdDSA");

		const token = await signJWT(makeSignCtx(ctx), {
			options: jwtOptions,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
		});
		const header = decodeProtectedHeader(token);
		expect(header.kid).toBe(provisioned.id);
		expect(header.alg).toBe("EdDSA");
	});

	it("signingKeyId routes through getKeyById and overrides latest-key selection", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		// Create two keys in order. Latest would be the second one.
		const older = await provisionKey(ctx, "ES256");
		await new Promise((resolve) => setTimeout(resolve, 5)); // ensure distinct createdAt
		await provisionKey(ctx, "EdDSA");

		const token = await signJWT(makeSignCtx(ctx), {
			options: jwtOptions,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
			signingKeyId: older.id,
		});
		const header = decodeProtectedHeader(token);
		expect(header.kid).toBe(older.id);
		expect(header.alg).toBe("ES256");
	});

	it("signingAlgorithm picks the most recent key with that alg", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		await provisionKey(ctx, "EdDSA");
		await new Promise((resolve) => setTimeout(resolve, 5));
		const newerEdDsa = await provisionKey(ctx, "EdDSA");
		await new Promise((resolve) => setTimeout(resolve, 5));
		await provisionKey(ctx, "ES256"); // newest overall — but wrong alg

		const token = await signJWT(makeSignCtx(ctx), {
			options: jwtOptions,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
			signingAlgorithm: "EdDSA",
		});
		const header = decodeProtectedHeader(token);
		expect(header.kid).toBe(newerEdDsa.id);
		expect(header.alg).toBe("EdDSA");
	});

	it("signingKeyId pointing at a missing key throws (does not silently fall back)", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		await provisionKey(ctx, "EdDSA");

		await expect(
			signJWT(makeSignCtx(ctx), {
				options: jwtOptions,
				payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
				signingKeyId: "nonexistent-kid",
			}),
		).rejects.toThrow(/signingKeyId.*not found/i);
	});

	it("signingAlgorithm with no matching key throws (does not auto-mint)", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		await provisionKey(ctx, "EdDSA");

		await expect(
			signJWT(makeSignCtx(ctx), {
				options: jwtOptions,
				payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
				signingAlgorithm: "ES256",
			}),
		).rejects.toThrow(/no key with alg "ES256"/i);
	});

	it("signingKeyId + mismatched signingAlgorithm throws to surface the conflict", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		const ed = await provisionKey(ctx, "EdDSA");

		await expect(
			signJWT(makeSignCtx(ctx), {
				options: jwtOptions,
				payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
				signingKeyId: ed.id,
				signingAlgorithm: "ES256",
			}),
		).rejects.toThrow(/alg "EdDSA".*signingAlgorithm.*"ES256"/);
	});

	it("signingKeyId + matching signingAlgorithm succeeds", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		const ed = await provisionKey(ctx, "EdDSA");

		const token = await signJWT(makeSignCtx(ctx), {
			options: jwtOptions,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
			signingKeyId: ed.id,
			signingAlgorithm: "EdDSA",
		});
		const header = decodeProtectedHeader(token);
		expect(header.kid).toBe(ed.id);
	});
});

describe("JWKS adapter helpers", () => {
	it("getKeyById finds a provisioned key", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		const k = await provisionKey(ctx, "EdDSA");

		const adapter = getJwksAdapter(ctx.adapter);
		const found = await adapter.getKeyById(makeSignCtx(ctx), k.id);
		expect(found?.id).toBe(k.id);
	});

	it("getKeyById returns undefined for an unknown id", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		await provisionKey(ctx, "EdDSA");

		const adapter = getJwksAdapter(ctx.adapter);
		const found = await adapter.getKeyById(makeSignCtx(ctx), "no-such-kid");
		expect(found).toBeUndefined();
	});

	it("getLatestKeyByAlg returns the most recent key matching the algorithm", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		await provisionKey(ctx, "EdDSA");
		await new Promise((resolve) => setTimeout(resolve, 5));
		const newerEd = await provisionKey(ctx, "EdDSA");
		await new Promise((resolve) => setTimeout(resolve, 5));
		await provisionKey(ctx, "ES256");

		const adapter = getJwksAdapter(ctx.adapter);
		const found = await adapter.getLatestKeyByAlg(makeSignCtx(ctx), "EdDSA");
		expect(found?.id).toBe(newerEd.id);
	});

	it("getLatestKeyByAlg returns undefined when no matching key exists", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		await provisionKey(ctx, "EdDSA");

		const adapter = getJwksAdapter(ctx.adapter);
		const found = await adapter.getLatestKeyByAlg(makeSignCtx(ctx), "ES256");
		expect(found).toBeUndefined();
	});
});

describe("signJWT — unpinned tokens stay on the primary algorithm", () => {
	const options = {
		jwks: {
			disablePrivateKeyEncryption: true,
			keyPairConfig: { alg: "RS256" },
			keyPairConfigs: [{ alg: "EdDSA" }],
		},
	} as const;

	it("mints the primary key instead of reusing a key minted for a pinned algorithm", async () => {
		const { auth } = await getTestInstance({
			plugins: [jwt(options)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);
		const payload = { sub: "u1", iat: Math.floor(Date.now() / 1000) };

		const pinned = await signJWT(makeSignCtx(ctx), {
			options,
			payload,
			signingAlgorithm: "EdDSA",
		});
		expect(decodeProtectedHeader(pinned).alg).toBe("EdDSA");

		const unpinned = await signJWT(makeSignCtx(ctx), { options, payload });
		expect(decodeProtectedHeader(unpinned).alg).toBe("RS256");

		const again = await signJWT(makeSignCtx(ctx), { options, payload });
		expect(decodeProtectedHeader(again).kid).toBe(
			decodeProtectedHeader(unpinned).kid,
		);
		const keys = await ctx.adapter.findMany<Jwk>({ model: "jwks" });
		expect(keys.map((k) => k.alg).sort()).toEqual(["EdDSA", "RS256"]);
	});

	it("keeps signing with a custom keyring's newest key when it has no primary-algorithm key", async () => {
		const { publicWebKey, privateWebKey } = await generateExportedKeyPair({
			jwks: { keyPairConfig: { alg: "EdDSA" } },
		});
		const keyring: Jwk[] = [
			{
				id: "keyring-eddsa",
				publicKey: JSON.stringify(publicWebKey),
				privateKey: JSON.stringify(privateWebKey),
				alg: "EdDSA",
				createdAt: new Date(),
			},
		];
		const keyringOptions = {
			...options,
			adapter: { getJwks: async () => keyring },
		};
		const { auth } = await getTestInstance({
			plugins: [jwt(keyringOptions)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);
		const payload = { sub: "u1", iat: Math.floor(Date.now() / 1000) };

		const first = await signJWT(makeSignCtx(ctx), {
			options: keyringOptions,
			payload,
		});
		const second = await signJWT(makeSignCtx(ctx), {
			options: keyringOptions,
			payload,
		});
		expect(decodeProtectedHeader(first)).toMatchObject({
			alg: "EdDSA",
			kid: "keyring-eddsa",
		});
		expect(decodeProtectedHeader(second).kid).toBe("keyring-eddsa");
		expect(await ctx.adapter.findMany<Jwk>({ model: "jwks" })).toEqual([]);
	});

	it("keeps signing with an existing key whose algorithm is not configured for pinning", async () => {
		const { auth } = await getTestInstance({
			plugins: [jwt(options)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);
		const previous = await provisionKey(ctx, "ES256");

		const token = await signJWT(makeSignCtx(ctx), {
			options,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
		});
		expect(decodeProtectedHeader(token).kid).toBe(previous.id);
	});
});

describe("auth.api.signJWT — header and signing key", () => {
	it("sets typ and cty while alg and kid come from the plugin, with no request", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		const key = await provisionKey(ctx, "EdDSA");

		const { token } = await auth.api.signJWT({
			body: {
				payload: { sub: "u1" },
				header: { typ: "logout+jwt", cty: "JWT" },
			},
		});
		expect(decodeProtectedHeader(token)).toEqual({
			typ: "logout+jwt",
			cty: "JWT",
			alg: "EdDSA",
			kid: key.id,
		});
	});

	it.each(["alg", "kid", "jku", "x5u", "jwk", "b64", "crit"])(
		"rejects %s in header",
		async (member) => {
			const { auth } = await bootJwt();

			await expect(
				auth.api.signJWT({
					body: {
						payload: { sub: "u1" },
						header: { typ: "JWT", [member]: "attacker" } as never,
					},
				}),
			).rejects.toMatchObject({ status: 400 });
		},
	);

	it("rejects header members outside the public type", async () => {
		const { auth } = await bootJwt();

		await expect(
			auth.api.signJWT({
				body: {
					payload: { sub: "u1" },
					// @ts-expect-error only typ and cty are settable
					header: { kid: "attacker" },
				},
			}),
		).rejects.toMatchObject({ status: 400 });
	});

	it("signs with the key named by signingKeyId", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		const older = await provisionKey(ctx, "ES256");
		await new Promise((resolve) => setTimeout(resolve, 5));
		await provisionKey(ctx, "EdDSA");

		const { token } = await auth.api.signJWT({
			body: { payload: { sub: "u1" }, signingKeyId: older.id },
		});
		const header = decodeProtectedHeader(token);
		expect(header.kid).toBe(older.id);
		expect(header.alg).toBe("ES256");
	});

	it("throws for an unknown signingKeyId instead of using another key", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		await provisionKey(ctx, "EdDSA");

		await expect(
			auth.api.signJWT({
				body: { payload: { sub: "u1" }, signingKeyId: "no-such-kid" },
			}),
		).rejects.toThrow(/signingKeyId "no-such-kid" not found in JWKS/);
	});

	it("signs with the newest key of signingAlgorithm", async () => {
		const { auth } = await bootJwt();
		const ctx = asShim(await auth.$context);
		const es256 = await provisionKey(ctx, "ES256");
		await new Promise((resolve) => setTimeout(resolve, 5));
		await provisionKey(ctx, "EdDSA");

		const { token } = await auth.api.signJWT({
			body: { payload: { sub: "u1" }, signingAlgorithm: "ES256" },
		});
		const header = decodeProtectedHeader(token);
		expect(header.kid).toBe(es256.id);
		expect(header.alg).toBe("ES256");
	});

	it("mints a signingAlgorithm key on first use only when keyPairConfigs lists it", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						disablePrivateKeyEncryption: true,
						keyPairConfigs: [{ alg: "ES256" }],
					},
				}),
			],
			logger: { level: "error" },
		});

		const { token } = await auth.api.signJWT({
			body: { payload: { sub: "u1" }, signingAlgorithm: "ES256" },
		});
		expect(decodeProtectedHeader(token).alg).toBe("ES256");

		await expect(
			auth.api.signJWT({
				body: { payload: { sub: "u1" }, signingAlgorithm: "RS256" },
			}),
		).rejects.toThrow(/no key with alg "RS256"/);
	});

	it("rejects an unsupported signingAlgorithm", async () => {
		const { auth } = await bootJwt();

		await expect(
			auth.api.signJWT({
				body: {
					payload: { sub: "u1" },
					// @ts-expect-error HS256 is not an asymmetric JWKS algorithm
					signingAlgorithm: "HS256",
				},
			}),
		).rejects.toMatchObject({ status: 400 });
	});

	it("reads and mints keys through the configured adapter", async () => {
		const keys: Jwk[] = [];
		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						disablePrivateKeyEncryption: true,
						keyPairConfigs: [{ alg: "ES256" }],
					},
					adapter: {
						getJwks: async () => keys,
						createJwk: async (webKey) => {
							const key = { ...webKey, id: `custom-${keys.length}` } as Jwk;
							keys.push(key);
							return key;
						},
					},
				}),
			],
			logger: { level: "error" },
		});

		const { token } = await auth.api.signJWT({
			body: { payload: { sub: "u1" }, signingAlgorithm: "ES256" },
		});
		expect(keys).toHaveLength(1);
		expect(decodeProtectedHeader(token)).toMatchObject({
			alg: "ES256",
			kid: "custom-0",
		});

		const { token: pinned } = await auth.api.signJWT({
			body: { payload: { sub: "u1" }, signingKeyId: "custom-0" },
		});
		expect(decodeProtectedHeader(pinned).kid).toBe("custom-0");
		expect(keys).toHaveLength(1);
	});

	it("passes header and signing overrides to a custom jwt.sign", async () => {
		const calls: unknown[][] = [];
		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						remoteUrl: "https://kms.example.com/jwks.json",
						keyPairConfig: { alg: "ES256" },
					},
					jwt: {
						sign: async (...args) => {
							calls.push(args);
							return "remote.signed.jwt";
						},
					},
				}),
			],
			logger: { level: "error" },
		});

		const { token } = await auth.api.signJWT({
			body: {
				payload: { sub: "u1" },
				header: { typ: "logout+jwt" },
				signingKeyId: "kms-key-1",
				signingAlgorithm: "ES256",
			},
		});
		expect(token).toBe("remote.signed.jwt");
		expect(calls[0]?.[1]).toEqual({ typ: "logout+jwt" });
		expect(calls[0]?.[2]).toEqual({
			signingKeyId: "kms-key-1",
			signingAlgorithm: "ES256",
		});
	});
});
