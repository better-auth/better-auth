import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import type { JWTPayload } from "jose";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { jwt } from ".";
import { getJwksAdapter } from "./adapter";
import { signJWT } from "./sign";
import type { JWSAlgorithms, Jwk } from "./types";
import { generateExportedKeyPair } from "./utils";

/**
 * Shim — see `sign-overrides.test.ts` for rationale.
 */
type AuthContextShim = AuthContext;
const asShim = (ctx: unknown): AuthContextShim => ctx as AuthContextShim;

/**
 * Helper: provisions a JWK row directly with optional overrides. Unlike the
 * counterpart in `sign-overrides.test.ts`, this one accepts overrides for
 * `alg`, `expiresAt`, and `createdAt` so we can simulate:
 *   - legacy rows missing `alg` (pre-migration JWKS entries)
 *   - expired rows
 *   - ordering quirks (different createdAt values)
 */
async function provisionKey(
	ctx: AuthContextShim,
	opts: {
		alg: JWSAlgorithms;
		persistAlg?: boolean;
		expiresAt?: Date;
		createdAt?: Date;
	},
): Promise<Jwk> {
	const { publicWebKey, privateWebKey } = await generateExportedKeyPair({
		jwks: { keyPairConfig: { alg: opts.alg } as never },
	});
	const data: Omit<Jwk, "id"> = {
		publicKey: JSON.stringify(publicWebKey),
		privateKey: JSON.stringify(privateWebKey),
		createdAt: opts.createdAt ?? new Date(),
	};
	if (opts.persistAlg !== false) {
		data.alg = opts.alg;
	}
	if (opts.expiresAt) {
		data.expiresAt = opts.expiresAt;
	}
	return ctx.adapter.create<Omit<Jwk, "id">, Jwk>({
		model: "jwks",
		data,
	});
}

function makeSignCtx(authCtx: AuthContextShim): GenericEndpointContext {
	return { context: authCtx } as unknown as GenericEndpointContext;
}

/* -----------------------------------------------------------------------
 * Custom `jwt.sign` callback receives per-call signing config
 * --------------------------------------------------------------------- */

describe("custom jwt.sign callback receives signing overrides", () => {
	it("forwards signingKeyId and signingAlgorithm to the custom signer", async () => {
		const customSign = vi.fn(
			async (
				_payload: JWTPayload,
				_header?: { typ?: string; cty?: string },
				_signingConfig?: {
					signingKeyId?: string | undefined;
					signingAlgorithm?: JWSAlgorithms | undefined;
				},
			): Promise<string> => "signed.by.kms",
		);

		const opts = {
			jwks: {
				remoteUrl: "https://example.test/jwks.json",
				keyPairConfig: { alg: "EdDSA" },
			},
			jwt: { sign: customSign },
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const token = await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
			signingKeyId: "kms-key-1",
			signingAlgorithm: "ES256",
		});

		expect(token).toBe("signed.by.kms");
		expect(customSign).toHaveBeenCalledTimes(1);
		const [payloadArg, , configArg] = customSign.mock.calls[0]!;
		expect(payloadArg.sub).toBe("u1");
		expect(configArg).toEqual({
			signingKeyId: "kms-key-1",
			signingAlgorithm: "ES256",
		});
	});

	it("passes signingConfig with undefined fields when no overrides are set (back-compat)", async () => {
		const customSign = vi.fn(
			async (
				_payload: JWTPayload,
				_header?: { typ?: string; cty?: string },
				_signingConfig?: {
					signingKeyId?: string | undefined;
					signingAlgorithm?: JWSAlgorithms | undefined;
				},
			): Promise<string> => "default.signed.token",
		);
		const opts = {
			jwks: {
				remoteUrl: "https://example.test/jwks.json",
				keyPairConfig: { alg: "EdDSA" },
			},
			jwt: { sign: customSign },
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
		});

		expect(customSign).toHaveBeenCalledTimes(1);
		const [, , configArg] = customSign.mock.calls[0]!;
		expect(configArg).toEqual({
			signingKeyId: undefined,
			signingAlgorithm: undefined,
		});
	});

	it("legacy single-arg signer implementations still work (extra args ignored)", async () => {
		// Simulate a pre-update signer that only declares the payload param.
		// The runtime passes header and signingConfig args; the function
		// simply ignores them.
		const legacySign = vi.fn(
			async (payload: JWTPayload): Promise<string> =>
				`legacy.${payload.sub ?? "anon"}`,
		);
		const opts = {
			jwks: {
				remoteUrl: "https://example.test/jwks.json",
				keyPairConfig: { alg: "EdDSA" },
			},
			jwt: {
				// Cast: the legacy signature is assignable to the new optional
				// extra-args variant. A real consumer who hasn't updated their
				// callback would not see a type break.
				sign: legacySign as unknown as (payload: JWTPayload) => Promise<string>,
			},
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const token = await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u2", iat: Math.floor(Date.now() / 1000) },
			signingKeyId: "remote-key-7",
		});
		expect(token).toBe("legacy.u2");
		// Even though the implementation ignores them, JS still receives the
		// args (payload, header, signingConfig) — confirm runtime didn't
		// strip the call site.
		expect(legacySign.mock.calls[0]!.length).toBe(3);
	});
});

/* -----------------------------------------------------------------------
 * getLatestKeyByAlg fallback for legacy rows + expired filter
 * --------------------------------------------------------------------- */

describe("getLatestKeyByAlg legacy-row fallback", () => {
	it("matches legacy rows (alg: null) against configured keyPairConfig.alg", async () => {
		// Default keyPairConfig.alg is EdDSA. A row written before the alg
		// column existed has alg: null. Requesting EdDSA must still find it.
		const { auth } = await getTestInstance({
			plugins: [jwt({ jwks: { disablePrivateKeyEncryption: true } })],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const legacy = await provisionKey(ctx, {
			alg: "EdDSA",
			persistAlg: false,
		});

		const adapter = getJwksAdapter(ctx.adapter, {
			jwks: { keyPairConfig: { alg: "EdDSA" } },
		});
		const found = await adapter.getLatestKeyByAlg(makeSignCtx(ctx), "EdDSA");
		expect(found?.id).toBe(legacy.id);
	});

	it("does NOT match legacy rows against a non-default alg", async () => {
		// A legacy row falls back to the config default (EdDSA). Asking for
		// ES256 must not pick it up just because alg is null.
		const { auth } = await getTestInstance({
			plugins: [jwt({ jwks: { disablePrivateKeyEncryption: true } })],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		await provisionKey(ctx, { alg: "EdDSA", persistAlg: false });

		const adapter = getJwksAdapter(ctx.adapter, {
			jwks: { keyPairConfig: { alg: "EdDSA" } },
		});
		const found = await adapter.getLatestKeyByAlg(makeSignCtx(ctx), "ES256");
		expect(found).toBeUndefined();
	});

	it("matches legacy rows against a non-default configured alg", async () => {
		// When keyPairConfig.alg is ES256, legacy rows fall back to ES256.
		const { auth } = await getTestInstance({
			plugins: [
				jwt({
					jwks: {
						disablePrivateKeyEncryption: true,
						keyPairConfig: { alg: "ES256" },
					},
				}),
			],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const legacyEs = await provisionKey(ctx, {
			alg: "ES256",
			persistAlg: false,
		});

		const adapter = getJwksAdapter(ctx.adapter, {
			jwks: { keyPairConfig: { alg: "ES256" } },
		});
		const found = await adapter.getLatestKeyByAlg(makeSignCtx(ctx), "ES256");
		expect(found?.id).toBe(legacyEs.id);
		const negative = await adapter.getLatestKeyByAlg(makeSignCtx(ctx), "EdDSA");
		expect(negative).toBeUndefined();
	});

	it("explicit-alg rows still win over legacy fallback when both match", async () => {
		// If both a labeled EdDSA row and a legacy row exist, the newest of
		// either should win — the fallback shouldn't change ordering.
		const { auth } = await getTestInstance({
			plugins: [jwt({ jwks: { disablePrivateKeyEncryption: true } })],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const older = await provisionKey(ctx, {
			alg: "EdDSA",
			persistAlg: false,
			createdAt: new Date(Date.now() - 60_000),
		});
		const newer = await provisionKey(ctx, {
			alg: "EdDSA",
			persistAlg: true,
			createdAt: new Date(),
		});

		const adapter = getJwksAdapter(ctx.adapter, {
			jwks: { keyPairConfig: { alg: "EdDSA" } },
		});
		const found = await adapter.getLatestKeyByAlg(makeSignCtx(ctx), "EdDSA");
		expect(found?.id).toBe(newer.id);
		expect(found?.id).not.toBe(older.id);
	});

	it("signJWT honors legacy-row alg fallback end-to-end", async () => {
		// signingAlgorithm: "EdDSA" must resolve to a legacy (alg-null) row
		// when keyPairConfig.alg is EdDSA. Regression for the original report.
		const opts = { jwks: { disablePrivateKeyEncryption: true } } as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const legacy = await provisionKey(ctx, {
			alg: "EdDSA",
			persistAlg: false,
		});

		const token = await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
			signingAlgorithm: "EdDSA",
		});
		// Decode the header to confirm the legacy key was used.
		const { decodeProtectedHeader } = await import("jose");
		const header = decodeProtectedHeader(token);
		expect(header.kid).toBe(legacy.id);
		expect(header.alg).toBe("EdDSA");
	});
});

describe("expired-key filtering inside adapter lookups", () => {
	it("getLatestKey skips expired rows even when they are the newest", async () => {
		// An expired-but-newer key must NOT shadow a still-valid older one.
		const opts = { jwks: { disablePrivateKeyEncryption: true } } as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const live = await provisionKey(ctx, {
			alg: "EdDSA",
			createdAt: new Date(Date.now() - 60_000),
		});
		await provisionKey(ctx, {
			alg: "EdDSA",
			createdAt: new Date(),
			expiresAt: new Date(Date.now() - 1_000),
		});

		const adapter = getJwksAdapter(ctx.adapter, opts);
		const found = await adapter.getLatestKey(makeSignCtx(ctx));
		expect(found?.id).toBe(live.id);
	});

	it("getLatestKeyByAlg skips expired rows even when they are the newest", async () => {
		const opts = { jwks: { disablePrivateKeyEncryption: true } } as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const live = await provisionKey(ctx, {
			alg: "EdDSA",
			createdAt: new Date(Date.now() - 60_000),
		});
		await provisionKey(ctx, {
			alg: "EdDSA",
			createdAt: new Date(),
			expiresAt: new Date(Date.now() - 1_000),
		});

		const adapter = getJwksAdapter(ctx.adapter, opts);
		const found = await adapter.getLatestKeyByAlg(makeSignCtx(ctx), "EdDSA");
		expect(found?.id).toBe(live.id);
	});

	it("getLatestKeyByAlg returns undefined when all matches are expired", async () => {
		const opts = { jwks: { disablePrivateKeyEncryption: true } } as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		await provisionKey(ctx, {
			alg: "ES256",
			expiresAt: new Date(Date.now() - 1_000),
		});

		const adapter = getJwksAdapter(ctx.adapter, opts);
		const found = await adapter.getLatestKeyByAlg(makeSignCtx(ctx), "ES256");
		expect(found).toBeUndefined();
	});
});

/* -----------------------------------------------------------------------
 * Pinned (signingKeyId, signingAlgorithm) against a legacy null-alg row
 * --------------------------------------------------------------------- */

describe("pinned-kid + signingAlgorithm against legacy null-alg rows", () => {
	it("accepts a legacy row when signingAlgorithm matches keyPairConfig.alg (default EdDSA)", async () => {
		// Pre-fix, signJWT compared (key.alg ?? undefined) directly against
		// config.signingAlgorithm. A pinned (kid, alg) pair where the key is
		// a legacy alg:null row threw, even though the row's effective alg
		// matches the configured keyPairConfig.alg.
		const opts = { jwks: { disablePrivateKeyEncryption: true } } as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const legacy = await provisionKey(ctx, {
			alg: "EdDSA",
			persistAlg: false,
		});

		const token = await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
			signingKeyId: legacy.id,
			signingAlgorithm: "EdDSA",
		});
		expect(token).toBeTypeOf("string");
		expect(token.length).toBeGreaterThan(0);
	});

	it("throws when pinned signingAlgorithm differs from the legacy row's effective alg", async () => {
		// Negative case: a legacy row's effective alg is keyPairConfig.alg
		// (EdDSA). Pinning the same kid + signingAlgorithm: "ES256" should
		// throw the mismatch error so admins see the config bug.
		const opts = { jwks: { disablePrivateKeyEncryption: true } } as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const legacy = await provisionKey(ctx, {
			alg: "EdDSA",
			persistAlg: false,
		});

		await expect(
			signJWT(makeSignCtx(ctx), {
				options: opts,
				payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
				signingKeyId: legacy.id,
				signingAlgorithm: "ES256",
			}),
		).rejects.toThrow(/inherits keyPairConfig\.alg/);
	});
});

/* -----------------------------------------------------------------------
 * jwks schema persistence (alg, crv) — tripwire for downstream consumers
 * that skipped `npx @better-auth/cli generate` after the schema bump.
 * --------------------------------------------------------------------- */

describe("jwks.alg / jwks.crv persistence after createJwk", () => {
	it("persists alg and crv on a freshly-minted EdDSA key", async () => {
		// Without these columns, getLatestKeyByAlg falls back to scanning
		// every row and only matching via keyPairConfig.alg — a downstream
		// consumer who forgot to migrate would silently lose per-resource
		// signing pins. This test pins the schema contract so the failure
		// mode is "test fails because column is missing" rather than the
		// cryptic `signJWT: no key with alg "X" found` runtime error.
		const opts = { jwks: { disablePrivateKeyEncryption: true } } as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);
		await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
		});

		const rows = await ctx.adapter.findMany<Jwk>({ model: "jwks" });
		expect(rows.length).toBeGreaterThan(0);
		const row = rows[0]!;
		expect(row.alg).toBe("EdDSA");
		expect(row.crv).toBe("Ed25519");
	});

	it("persists alg and crv on a freshly-minted ES256 key", async () => {
		const opts = {
			jwks: {
				disablePrivateKeyEncryption: true,
				keyPairConfig: { alg: "ES256" as const },
			},
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);
		await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
		});

		const rows = await ctx.adapter.findMany<Jwk>({ model: "jwks" });
		expect(rows.length).toBeGreaterThan(0);
		const row = rows[0]!;
		expect(row.alg).toBe("ES256");
		// EC keys derive the curve at generation time — P-256 for ES256.
		expect(row.crv).toBe("P-256");
	});
});

/* -----------------------------------------------------------------------
 * keyPairConfigs[] — lazy-mint additional algorithms for per-resource pins
 * --------------------------------------------------------------------- */

describe("keyPairConfigs[] lazy-mint", () => {
	it("lazy-mints a key the first time signingAlgorithm pins an alg declared in keyPairConfigs[]", async () => {
		// Plugin default minted at first signJWT is EdDSA. When a resource
		// pin requests ES256 and the alg is present in keyPairConfigs[], the
		// plugin must materialize an ES256 row on demand. Without this path,
		// the request would throw "no key with alg X" even though the
		// operator declared ES256 as an allowed algorithm.
		const opts = {
			jwks: {
				disablePrivateKeyEncryption: true,
				keyPairConfig: { alg: "EdDSA" as const },
				keyPairConfigs: [{ alg: "ES256" as const }],
			},
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		// Before the pin: only the lazy default-alg key may exist.
		const before = await ctx.adapter.findMany<Jwk>({ model: "jwks" });
		const es256Before = before.filter((r) => r.alg === "ES256");
		expect(es256Before.length).toBe(0);

		const token = await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
			signingAlgorithm: "ES256",
		});
		expect(token).toBeTypeOf("string");
		expect(token.length).toBeGreaterThan(0);

		const after = await ctx.adapter.findMany<Jwk>({ model: "jwks" });
		const es256After = after.filter((r) => r.alg === "ES256");
		expect(es256After.length).toBe(1);
		expect(es256After[0]?.crv).toBe("P-256");
	});

	it("sequential signJWT calls reuse the lazy-minted key (no double-mint within a single thread of execution)", async () => {
		// NOTE: this pins the sequential-call contract only. Concurrent first
		// uses of the same alg can still race: two `await signJWT(...)` calls
		// in `Promise.all` against an empty JWKS may both observe a missing
		// row and both `createJwk`, producing two rows for the same alg.
		// `getLatestKeyByAlg` picks the newest, so subsequent calls converge
		// — the contract is "at least one key per alg," not "exactly one."
		// Tightening to single-mint requires a transactional mint primitive
		// on the adapter (tracked as a follow-up).
		const opts = {
			jwks: {
				disablePrivateKeyEncryption: true,
				keyPairConfig: { alg: "EdDSA" as const },
				keyPairConfigs: [{ alg: "ES256" as const }],
			},
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
			signingAlgorithm: "ES256",
		});
		await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u2", iat: Math.floor(Date.now() / 1000) },
			signingAlgorithm: "ES256",
		});

		const rows = await ctx.adapter.findMany<Jwk>({ model: "jwks" });
		const es256 = rows.filter((r) => r.alg === "ES256");
		expect(es256.length).toBe(1);
	});

	it("throws enriched error naming keyPairConfig.alg + keyPairConfigs when the requested alg is not provisioned", async () => {
		// signingAlgorithm: ES256, but it's not in keyPairConfig nor
		// keyPairConfigs. Error must name the configured default so the
		// caller diagnoses the mismatch without reading source.
		const opts = {
			jwks: {
				disablePrivateKeyEncryption: true,
				keyPairConfig: { alg: "EdDSA" as const },
				keyPairConfigs: [{ alg: "RS256" as const }],
			},
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);
		await expect(
			signJWT(makeSignCtx(ctx), {
				options: opts,
				payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
				signingAlgorithm: "ES256",
			}),
		).rejects.toThrow(
			/keyPairConfig\.alg="EdDSA".*keyPairConfigs: RS256.*Add "ES256"/,
		);
	});

	it("declares 'none' for keyPairConfigs in the error message when none are configured", async () => {
		const opts = {
			jwks: {
				disablePrivateKeyEncryption: true,
				keyPairConfig: { alg: "EdDSA" as const },
			},
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);
		await expect(
			signJWT(makeSignCtx(ctx), {
				options: opts,
				payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
				signingAlgorithm: "ES256",
			}),
		).rejects.toThrow(/keyPairConfigs: none/);
	});
});

/* -----------------------------------------------------------------------
 * Primary-alg pin on an empty JWKS — finding 1 from second-pass review
 * --------------------------------------------------------------------- */

describe("primary-alg pin on an empty JWKS", () => {
	it("lazy-mints when signingAlgorithm equals keyPairConfig.alg and no key exists", async () => {
		// Before the fix, signJWT only lazy-minted when the requested alg
		// was in keyPairConfigs[]. Pinning the primary alg (default EdDSA)
		// on a fresh deploy with an empty JWKS threw, even though the
		// plugin's own default would have produced exactly that key.
		// This made the docs' own object-form audience example fail on
		// first issuance.
		const opts = {
			jwks: {
				disablePrivateKeyEncryption: true,
				keyPairConfig: { alg: "EdDSA" as const },
			},
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		const before = await ctx.adapter.findMany<Jwk>({ model: "jwks" });
		expect(before.length).toBe(0);

		const token = await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
			signingAlgorithm: "EdDSA",
		});
		expect(token).toBeTypeOf("string");
		expect(token.length).toBeGreaterThan(0);

		const after = await ctx.adapter.findMany<Jwk>({ model: "jwks" });
		expect(after.length).toBe(1);
		expect(after[0]?.alg).toBe("EdDSA");
	});

	it("lazy-mints primary alg even when keyPairConfigs is undefined", async () => {
		// Sanity: a deployment with no keyPairConfigs at all must still
		// be able to pin the primary alg on a fresh JWKS.
		const opts = {
			jwks: {
				disablePrivateKeyEncryption: true,
				keyPairConfig: { alg: "ES256" as const },
			},
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);
		const token = await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u1", iat: Math.floor(Date.now() / 1000) },
			signingAlgorithm: "ES256",
		});
		expect(token).toBeTypeOf("string");
	});
});

/* -----------------------------------------------------------------------
 * Unpinned tokens stick to primary alg — finding 2 from second-pass review
 * --------------------------------------------------------------------- */

describe("unpinned tokens stay on keyPairConfig.alg after lazy-minting extras", () => {
	it("ID token (unpinned) signs with primary alg even after a non-primary alg is lazy-minted", async () => {
		// Before the fix, the unpinned path used getLatestKey() which returns
		// the newest row across ALL algs. Once a per-resource pin lazy-minted
		// an extra alg (ES256), it became "newer" than the primary EdDSA key
		// and unpinned tokens silently switched algs. ID tokens are unpinned;
		// flipping their alg breaks resource-server verifiers and OIDC
		// discovery clients that cached id_token_signing_alg_values_supported.
		const opts = {
			jwks: {
				disablePrivateKeyEncryption: true,
				keyPairConfig: { alg: "EdDSA" as const },
				keyPairConfigs: [{ alg: "ES256" as const }],
			},
		} as const;
		const { auth } = await getTestInstance({
			plugins: [jwt(opts)],
			logger: { level: "error" },
		});
		const ctx = asShim(await auth.$context);

		// Force-mint the primary key by signing once with no override.
		const primaryToken = await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u-primary", iat: Math.floor(Date.now() / 1000) },
		});
		const primaryHeader = JSON.parse(
			Buffer.from(primaryToken.split(".")[0]!, "base64url").toString(),
		);
		expect(primaryHeader.alg).toBe("EdDSA");

		// Wait one millisecond so the lazy-minted ES256 row has a strictly
		// newer createdAt than the EdDSA row. Then force-mint the ES256 row.
		await new Promise((r) => setTimeout(r, 5));
		await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u-extra", iat: Math.floor(Date.now() / 1000) },
			signingAlgorithm: "ES256",
		});

		// Now the JWKS has both rows — ES256 is newer. Unpinned signing
		// must still resolve to EdDSA.
		const unpinned = await signJWT(makeSignCtx(ctx), {
			options: opts,
			payload: { sub: "u-after", iat: Math.floor(Date.now() / 1000) },
		});
		const unpinnedHeader = JSON.parse(
			Buffer.from(unpinned.split(".")[0]!, "base64url").toString(),
		);
		expect(unpinnedHeader.alg).toBe("EdDSA");
	});
});
