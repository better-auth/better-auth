import {
	importJWK,
	exportJWK,
	generateKeyPair,
	SignJWT,
	type JWTPayload,
} from "jose";
import type { GenericEndpointContext } from "../../types";
import { BetterAuthError } from "../../error";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { getJwtPlugin, toExpJWT } from "./utils";
import type { Jwk } from "./schema";
import { getJwksAdapter } from "./adapter";
import type { JwtPluginOptions } from "./types";

/**
 * Signs a payload in jwt format.
 * For security, exp will be generated (from iat or current time) if not supplied.
 *
 * @internal - SCOPED TO PLUGIN. Use signJwt for usage in other plugins.
 *
 * @param ctx - endpoint context
 * @param payload - payload to sign
 */
export async function signJwtPayload(
	ctx: GenericEndpointContext,
	payload: JWTPayload,
	options?: JwtPluginOptions,
) {
	// Iat strict checks
	const nowSeconds = Math.floor(Date.now() / 1000);
	const iat = payload.iat;
	if (iat && iat > nowSeconds) {
		throw new BetterAuthError("unable to set a future iat time");
	}

	// Exp safety checks
	let exp = payload.exp;
	const allowLargerExpTime = options?.jwt?.allowLongerExpTime;
	const defaultExp = toExpJWT(
		options?.jwt?.expirationTime ?? "1h",
		iat ?? nowSeconds,
	);
	if (!allowLargerExpTime && exp && exp > defaultExp) {
		throw new BetterAuthError("unable to set future exp time");
	}
	exp = exp ?? defaultExp;

	// Nbf strict checks
	const nbf = payload.nbf;
	if (nbf && ((iat && nbf < iat) || nbf > exp)) {
		throw new BetterAuthError("nbf invalid");
	}

	// Iss safety checks
	const iss = payload.iss;
	const defaultIss = options?.jwt?.issuer ?? ctx.context.options.baseURL!;
	const allowIssuerMismatch = options?.jwt?.allowIssuerMismatch;
	if (!allowIssuerMismatch && iss && iss !== defaultIss) {
		throw new BetterAuthError(`iss ${iss} not allowed`);
	}

	// Aud safety checks (for non-oAuth mode, audience checking shall be performed in oAuth plugin instead)
	const aud = payload.aud;
	const defaultAud = options?.jwt?.audience ?? ctx.context.options.baseURL!;
	const allowAudienceMismatch = options?.jwt?.allowAudienceMismatch;
	if (!options?.usesOauthProvider && !allowAudienceMismatch && aud) {
		const allowedAudiences =
			typeof defaultAud === "string" ? [defaultAud] : defaultAud;
		if (typeof aud === "string" && !allowedAudiences.includes(aud)) {
			throw new BetterAuthError(`aud ${aud} not allowed`);
		} else {
			for (const _aud of aud) {
				if (!allowedAudiences.includes(_aud)) {
					throw new BetterAuthError(`aud ${_aud} not allowed`);
				}
			}
		}
	}

	// Custom/remote signing function
	if (options?.jwt?.sign) {
		payload = {
			...payload,
			iat,
			exp,
			iss: iss ?? defaultIss,
			aud: aud ?? defaultAud,
		};
		return options.jwt.sign(payload);
	}

	const adapter = getJwksAdapter(ctx.context.adapter);

	let key = await adapter.getLatestKey();
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;

	if (key === undefined) {
		key = await createJwkOnDb(ctx, options);
	}

	let privateWebKey = privateKeyEncryptionEnabled
		? await symmetricDecrypt({
				key: ctx.context.secret,
				data: JSON.parse(key.privateKey),
			}).catch(() => {
				throw new BetterAuthError(
					"Failed to decrypt private private key. Make sure the secret currently in use is the same as the one used to encrypt the private key. If you are using a different secret, either cleanup your jwks or disable private key encryption.",
				);
			})
		: key.privateKey;

	const privateKey = await importJWK(
		JSON.parse(privateWebKey),
		options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
	);

	const jwt = new SignJWT(payload)
		.setProtectedHeader({
			alg: options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
			kid: key.id,
			typ: "JWT",
		})
		.setExpirationTime(exp)
		.setIssuer(iss ?? defaultIss)
		.setAudience(aud ?? defaultAud);
	const sub =
		payload.sub ??
		(await options?.jwt?.getSubject?.(ctx.context.session!)) ??
		ctx.context.session?.user.id;
	if (sub) jwt.setSubject(sub);
	if (payload.iat) jwt.setIssuedAt(iat);
	if (payload.nbf) jwt.setNotBefore(payload.nbf);
	if (payload.jti) jwt.setJti(payload.jti);
	return await jwt.sign(privateKey);
}

/**
 * Signs a payload in jwt format.
 *
 * @param ctx - endpoint context
 * @param payload - payload to sign
 */
// Plugin exportable
export async function signJwt(
	ctx: GenericEndpointContext,
	payload: JWTPayload,
) {
	const options = getJwtPlugin(ctx.context).options;
	return signJwtPayload(ctx, payload, options);
}

/**
 * Backwards compatable version of signJwt
 *
 * @deprecated - prefer signJwt to prevent option injection
 *
 * @param ctx - endpoint context
 * @param options - Jwt signing options. If not provided, uses the jwtPlugin options
 */
export async function getJwtToken(
	ctx: GenericEndpointContext,
	options?: JwtPluginOptions,
) {
	const payload = !options?.jwt?.definePayload
		? ctx.context.session!.user
		: await options?.jwt.definePayload(ctx.context.session!);
	return signJwtPayload(ctx, payload, options);
}

export async function generateExportedKeyPair(options?: JwtPluginOptions) {
	const { publicKey, privateKey } = await generateKeyPair(
		options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
		{
			...options?.jwks?.keyPairConfig,
			extractable: true,
		},
	);

	const publicWebKey = await exportJWK(publicKey);
	const privateWebKey = await exportJWK(privateKey);

	return { publicWebKey, privateWebKey };
}

/**
 * Creates a new JWK (JSON Web Key) on the database.
 *
 * @internal - SCOPED TO PLUGIN. Use createJwk for usage in other plugins.
 */
export async function createJwkOnDb(
	ctx: GenericEndpointContext,
	options?: JwtPluginOptions,
) {
	if (!options) {
		options = getJwtPlugin(ctx.context).options;
	}

	const { publicWebKey, privateWebKey } =
		await generateExportedKeyPair(options);
	const stringifiedPrivateWebKey = JSON.stringify(privateWebKey);
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;

	let jwk: Partial<Jwk> = {
		publicKey: JSON.stringify({
			alg: options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
			...publicWebKey,
		}),
		privateKey: privateKeyEncryptionEnabled
			? JSON.stringify(
					await symmetricEncrypt({
						key: ctx.context.secret,
						data: stringifiedPrivateWebKey,
					}),
				)
			: stringifiedPrivateWebKey,
		createdAt: new Date(),
	};

	const adapter = getJwksAdapter(ctx.context.adapter);
	const key = await adapter.createJwk(jwk as Jwk);

	return key;
}

/**
 * Creates a new JWK (JSON Web Key) on the database.
 *
 * @param ctx - endpoint context
 */
// Plugin exportable
export async function createJwk(ctx: GenericEndpointContext) {
	const options = getJwtPlugin(ctx.context).options;
	return createJwkOnDb(ctx, options);
}
