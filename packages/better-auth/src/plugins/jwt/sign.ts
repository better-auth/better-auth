import type { GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { JWTPayload } from "jose";
import { importJWK, SignJWT } from "jose";
import { symmetricDecrypt } from "../../crypto";
import { getJwksAdapter } from "./adapter";
import type { JWSAlgorithms, JwtOptions, ResolvedSigningKey } from "./types";
import { createJwk, toExpJWT } from "./utils";

type JWTPayloadWithOptional = {
	/**
	 * JWT Issuer
	 *
	 * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.1 RFC7519#section-4.1.1}
	 */
	iss?: string | undefined;

	/**
	 * JWT Subject
	 *
	 * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.2 RFC7519#section-4.1.2}
	 */
	sub?: string | undefined;

	/**
	 * JWT Audience
	 *
	 * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.3 RFC7519#section-4.1.3}
	 */
	aud?: string | string[] | undefined;

	/**
	 * JWT ID
	 *
	 * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.7 RFC7519#section-4.1.7}
	 */
	jti?: string | undefined;

	/**
	 * JWT Not Before
	 *
	 * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.5 RFC7519#section-4.1.5}
	 */
	nbf?: number | undefined;

	/**
	 * JWT Expiration Time
	 *
	 * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.4 RFC7519#section-4.1.4}
	 */
	exp?: number | undefined;

	/**
	 * JWT Issued At
	 *
	 * @see {@link https://www.rfc-editor.org/rfc/rfc7519#section-4.1.6 RFC7519#section-4.1.6}
	 */
	iat?: number | undefined;

	/** Any other JWT Claim Set member. */
	[propName: string]: unknown | undefined;
};

/**
 * Per-call signing overrides shared by `resolveSigningKey()` and `signJWT()`.
 *
 * Both fields are optional. When set, they shift key selection away from the
 * default "most recently created live key" behavior:
 *
 * - `signingKeyId` — load the exact JWKS row whose `id` equals this value
 *   (matches the JWS `kid` header). Throws if not found; never auto-mints
 *   a replacement (admin-provisioned key is the contract).
 * - `signingAlgorithm` — load the most recent live key with that `alg`. If
 *   none exists AND the algorithm is declared in `options.jwks.keyPairConfigs`
 *   (or equals the primary `keyPairConfig.alg`), the key is lazy-minted on
 *   demand. Otherwise throws with a descriptive error naming what IS
 *   provisioned.
 *
 * Used by the OAuth provider plugin to honor per-resource `signingAlgorithm` /
 * `signingKeyId` overrides without re-implementing key resolution.
 */
export interface SigningKeyOverrides {
	signingKeyId?: string | undefined;
	signingAlgorithm?: JWSAlgorithms | undefined;
}

/**
 * Resolves the JWKS signing key, decrypts it, and imports it
 * for use with jose's SignJWT. Returns null when signing is
 * delegated to a custom jwt.sign callback.
 *
 * Callers that need the signing algorithm before constructing
 * the JWT payload (e.g. for OIDC at_hash) should call this
 * first, read `.alg`, then pass the result to `signJWT` via
 * the `resolvedKey` option to avoid a redundant DB lookup.
 *
 * When `overrides.signingKeyId` or `overrides.signingAlgorithm` is set, key
 * selection follows the contract documented on {@link SigningKeyOverrides};
 * without overrides this returns the most recently created live key, falling
 * back to the primary `keyPairConfig.alg` when even that's absent so unpinned
 * tokens stay on the configured default algorithm even after extra algorithms
 * have been lazy-minted for audience pinning.
 */
export async function resolveSigningKey(
	ctx: GenericEndpointContext,
	options?: JwtOptions,
	overrides?: SigningKeyOverrides,
): Promise<ResolvedSigningKey | null> {
	if (options?.jwt?.sign) {
		return null;
	}
	const adapter = getJwksAdapter(ctx.context.adapter, options);
	let key: Awaited<ReturnType<typeof adapter.getLatestKey>>;

	if (overrides?.signingKeyId !== undefined) {
		// Explicit kid — admin must have provisioned it. Don't auto-mint a
		// replacement on miss; throw so the caller sees a config error rather
		// than silently signing with a different key.
		key = await adapter.getKeyById(ctx, overrides.signingKeyId);
		if (!key) {
			throw new BetterAuthError(
				`signJWT: signingKeyId "${overrides.signingKeyId}" not found in JWKS. The key must be provisioned before it can be referenced.`,
			);
		}
		if (overrides.signingAlgorithm !== undefined) {
			// Legacy rows persisted before the `alg` column existed have
			// `alg: null` and inherit `keyPairConfig.alg` per schema.ts. Mirror
			// the same fallback adapter.getLatestKeyByAlg uses so a pinned
			// (kid, alg) pair where the row matches the configured default
			// algorithm doesn't spuriously throw.
			const configAlg = options?.jwks?.keyPairConfig?.alg ?? "EdDSA";
			const effectiveAlg = key.alg ?? configAlg;
			if (effectiveAlg !== overrides.signingAlgorithm) {
				throw new BetterAuthError(
					`signJWT: signingKeyId "${overrides.signingKeyId}" has alg "${key.alg ?? `unset (inherits keyPairConfig.alg "${configAlg}")`}" but signingAlgorithm was set to "${overrides.signingAlgorithm}".`,
				);
			}
		}
	} else if (overrides?.signingAlgorithm !== undefined) {
		// Algorithm without an explicit kid — pick the most recent key with
		// that alg. If the requested alg isn't found, lazy-mint it on demand
		// when EITHER (a) it's declared in `options.jwks.keyPairConfigs` OR
		// (b) it equals the primary `keyPairConfig.alg` (so a fresh deploy
		// can issue tokens pinned to the default alg before any key has
		// been minted — without this, the first audience-pinned request
		// against an empty JWKS would throw even when the alg matches the
		// plugin's default). Otherwise throw with an enriched error message
		// naming the configured default so the mismatch is diagnosable.
		//
		// NOTE: lazy-mint here is read-then-create without database-level
		// locking. Two concurrent requests pinning the same alg against an
		// empty JWKS can both observe `null` and both `createJwk`, producing
		// two keys for that alg. Subsequent reads via `getLatestKeyByAlg`
		// pick the newest, so both keys remain usable for verification —
		// this is operationally tolerable but the contract is "at least
		// one key per alg," not "exactly one." Tightening would require a
		// transactional mint primitive on the adapter.
		key = await adapter.getLatestKeyByAlg(ctx, overrides.signingAlgorithm);
		if (!key) {
			const primaryAlg = options?.jwks?.keyPairConfig?.alg ?? "EdDSA";
			const preconfig = options?.jwks?.keyPairConfigs?.find(
				(c) => c.alg === overrides.signingAlgorithm,
			);
			const isPrimary = primaryAlg === overrides.signingAlgorithm;
			if (preconfig || isPrimary) {
				key = await createJwk(ctx, {
					...options,
					jwks: {
						...options?.jwks,
						// preconfig wins; otherwise fall back to the plugin's
						// existing primary config so derived `crv` matches.
						keyPairConfig: preconfig ?? options?.jwks?.keyPairConfig,
					},
				});
			} else {
				const advertisedExtra =
					options?.jwks?.keyPairConfigs?.map((c) => c.alg).join(", ") || "none";
				throw new BetterAuthError(
					`signJWT: no key with alg "${overrides.signingAlgorithm}" found in JWKS. The plugin auto-mints only one key matching keyPairConfig.alg="${primaryAlg}"; additional algs configured via keyPairConfigs: ${advertisedExtra}. Add "${overrides.signingAlgorithm}" to jwks.keyPairConfigs so the plugin provisions it on first use, or mint the key explicitly via createJwk().`,
				);
			}
		}
	} else {
		// Unpinned tokens (ID tokens, session-bound access tokens issued
		// without a `signingAlgorithm` override) must stay on the configured
		// primary alg. Using the generic `getLatestKey()` here would let a
		// lazy-minted `keyPairConfigs` row become the "newest" key once it's
		// provisioned and silently flip unpinned tokens onto a different alg
		// — race-dependent because access tokens and ID tokens issue in
		// parallel in the OAuth provider flow. Pinning to
		// `keyPairConfig.alg` keeps unpinned token alg stable across the
		// lifetime of the deployment regardless of how many extra algs are
		// provisioned for audience pinning. Falls back to `getLatestKey()`
		// when no key with the primary alg exists yet (fresh deploy).
		const primaryAlg = options?.jwks?.keyPairConfig?.alg ?? "EdDSA";
		key =
			(await adapter.getLatestKeyByAlg(ctx, primaryAlg)) ??
			(await adapter.getLatestKey(ctx));
	}

	if (!key || (key.expiresAt && key.expiresAt < new Date())) {
		// Only auto-mint when neither override was specified — preserves the
		// historical "lazy first-key" behavior without surprising callers
		// who explicitly pinned a key/alg.
		if (
			overrides?.signingKeyId !== undefined ||
			overrides?.signingAlgorithm !== undefined
		) {
			throw new BetterAuthError(
				"signJWT: requested signing key is expired and an explicit kid/alg was provided; not auto-minting a replacement. Rotate the key explicitly.",
			);
		}
		key = await createJwk(ctx, options);
	}
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;
	const privateWebKey = privateKeyEncryptionEnabled
		? await symmetricDecrypt({
				key: ctx.context.secretConfig,
				data: JSON.parse(key.privateKey),
			}).catch(() => {
				throw new BetterAuthError(
					"Failed to decrypt private key. Make sure the secret currently in use is the same as the one used to encrypt the private key. If you are using a different secret, either clean up your JWKS or disable private key encryption.",
				);
			})
		: key.privateKey;
	const alg = key.alg ?? options?.jwks?.keyPairConfig?.alg ?? "EdDSA";
	const privateKey = await importJWK(JSON.parse(privateWebKey), alg);
	return { alg, kid: key.id, privateKey };
}

export async function signJWT(
	ctx: GenericEndpointContext,
	config: {
		options?: JwtOptions | undefined;
		payload: JWTPayloadWithOptional;
		/** Pre-resolved key from resolveSigningKey. Skips redundant DB lookup. */
		resolvedKey?: ResolvedSigningKey;
		/**
		 * Extra JWS Protected Header parameters to merge with the defaults
		 * (`alg` and `kid`). Used by token profiles that require an explicit
		 * media type, such as OIDC Back-Channel Logout's `typ: "logout+jwt"`.
		 *
		 * @see https://www.rfc-editor.org/rfc/rfc8725#section-3.11
		 */
		header?: {
			typ?: string;
			cty?: string;
		};
		/**
		 * Optional override for the signing key. When set, looks up the key
		 * by its `id` (matches the JWS `kid` header) via the JWKS adapter.
		 * Throws if no key with that id exists.
		 *
		 * When unset, falls back to the most recently created key with the
		 * primary `keyPairConfig.alg` (the historical default).
		 */
		signingKeyId?: string | undefined;
		/**
		 * Optional override for the signing algorithm. Selects the most
		 * recent key with this algorithm. When neither this nor
		 * `signingKeyId` is set, the most recent key matching
		 * `keyPairConfig.alg` is used (historical default).
		 *
		 * If both `signingKeyId` and `signingAlgorithm` are set, `signingKeyId`
		 * wins; the algorithm is validated to match the resolved key and
		 * the call throws on mismatch.
		 */
		signingAlgorithm?: JWSAlgorithms | undefined;
	},
) {
	const { options } = config;
	const payload = config.payload as JWTPayload;

	// Iat
	const nowSeconds = Math.floor(Date.now() / 1000);
	const iat = payload.iat!;

	// Exp
	let exp = payload.exp;
	const defaultExp = toExpJWT(
		options?.jwt?.expirationTime ?? "15m",
		iat ?? nowSeconds,
	);
	exp = exp ?? defaultExp;

	// Nbf
	const nbf = payload.nbf!;

	// At handler-time, options.baseURL is always a resolved string origin
	const baseURLOrigin =
		typeof ctx.context.options.baseURL === "string"
			? ctx.context.options.baseURL
			: "";

	// Iss
	const iss = payload.iss;
	const defaultIss = options?.jwt?.issuer ?? baseURLOrigin;

	// Aud
	const aud = payload.aud;
	const defaultAud = options?.jwt?.audience ?? baseURLOrigin;

	// Custom/remote signing function
	if (options?.jwt?.sign) {
		const jwtPayload = {
			...payload,
			iat,
			exp,
			nbf,
			iss: iss ?? defaultIss,
			aud: aud ?? defaultAud,
		};
		// Forward extra protected-header parameters (e.g. `typ: "logout+jwt"`)
		// so profiles that require an explicit media type stay conformant even
		// with a remote signer. The signer still owns `alg`/`kid`. Also forward
		// per-call signing overrides as a third arg so remote KMS integrations
		// can honor per-resource kid/alg pinning. Both extra args are optional,
		// so existing single-arg implementations continue to work unchanged.
		return options.jwt.sign(jwtPayload, config.header, {
			signingKeyId: config.signingKeyId,
			signingAlgorithm: config.signingAlgorithm,
		});
	}

	// Use pre-resolved key if available, otherwise resolve from DB with
	// any per-call overrides plumbed through.
	const { alg, kid, privateKey } =
		config.resolvedKey ??
		(await resolveSigningKey(ctx, options, {
			signingKeyId: config.signingKeyId,
			signingAlgorithm: config.signingAlgorithm,
		}))!;

	const jwt = new SignJWT(payload)
		.setProtectedHeader({
			// Spread caller header first so the resolved `alg`/`kid` always win.
			...config.header,
			alg,
			kid,
		})
		.setExpirationTime(exp)
		.setIssuer(iss ?? defaultIss)
		.setAudience(aud ?? defaultAud);
	if (iat) jwt.setIssuedAt(iat);
	if (payload.sub) jwt.setSubject(payload.sub);
	if (payload.nbf) jwt.setNotBefore(payload.nbf);
	if (payload.jti) jwt.setJti(payload.jti);
	return await jwt.sign(privateKey);
}

export async function getJwtToken(
	ctx: GenericEndpointContext,
	options?: JwtOptions | undefined,
) {
	const payload = !options?.jwt?.definePayload
		? ctx.context.session!.user
		: await options.jwt.definePayload(ctx.context.session!);

	return await signJWT(ctx, {
		options,
		payload: {
			iat: Math.floor(Date.now() / 1000),
			...payload,
			sub:
				(await options?.jwt?.getSubject?.(ctx.context.session!)) ??
				ctx.context.session!.user.id,
		},
	});
}
