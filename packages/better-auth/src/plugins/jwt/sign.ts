import type { GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { JWTPayload } from "jose";
import { importJWK, SignJWT } from "jose";
import { symmetricDecrypt } from "../../crypto";
import { getJwksAdapter } from "./adapter";
import type { JwtOptions, ResolvedSigningKey } from "./types";
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
 * Resolves the JWKS signing key, decrypts it, and imports it
 * for use with jose's SignJWT. Returns null when signing is
 * delegated to a custom jwt.sign callback.
 *
 * Callers that need the signing algorithm before constructing
 * the JWT payload (e.g. for OIDC at_hash) should call this
 * first, read `.alg`, then pass the result to `signJWT` via
 * the `resolvedKey` option to avoid a redundant DB lookup.
 */
export async function resolveSigningKey(
	ctx: GenericEndpointContext,
	options?: JwtOptions,
): Promise<ResolvedSigningKey | null> {
	if (options?.jwt?.sign) {
		return null;
	}
	const adapter = getJwksAdapter(ctx.context.adapter, options);
	let key = await adapter.getLatestKey(ctx);
	if (!key || (key.expiresAt && key.expiresAt < new Date())) {
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
		return options.jwt.sign(jwtPayload);
	}

	// Use pre-resolved key if available, otherwise resolve from DB
	const { alg, kid, privateKey } =
		config.resolvedKey ?? (await resolveSigningKey(ctx, options))!;

	const jwt = new SignJWT(payload)
		.setProtectedHeader({
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
